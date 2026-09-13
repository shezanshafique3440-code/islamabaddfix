import type { Booking, BookingStatus, Prisma, Role } from '@prisma/client';
import { prisma, type Tx } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { getSetting } from '../settings';
import { splitCommission } from '../money';
import { activeBenefitsFor, emergencyFeeWaiverPaisa, memberDiscountPaisa } from '../memberships';
import { assertTransition, actorForRole, type Actor } from './state-machine';

/**
 * The only sanctioned way to change Booking.status.
 *
 * Guarantees, in one transaction:
 *  1. The transition is legal for this actor (state machine).
 *  2. Status-specific invariants hold (e.g. COMPLETED needs an agreed price).
 *  3. Timestamps and derived money fields are set server-side.
 *  4. A BookingStatusHistory row is written.
 *
 * Notifications are emitted after the transaction commits, by the caller, so a
 * slow or failing notification channel can never roll back a status change.
 */

export interface TransitionInput {
  bookingId: string;
  to: BookingStatus;
  actorRole: Role | 'SYSTEM';
  actorUserId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
  /** Extra fields to write alongside the status change. */
  patch?: Prisma.BookingUpdateInput;
}

export interface TransitionResult {
  booking: Booking;
  from: BookingStatus;
  to: BookingStatus;
}

function resolveActor(actorRole: Role | 'SYSTEM'): Actor {
  return actorRole === 'SYSTEM' ? 'SYSTEM' : actorForRole(actorRole);
}

/** Timestamp column matching each status, so history is queryable directly. */
function timestampPatch(to: BookingStatus, now: Date): Prisma.BookingUpdateInput {
  switch (to) {
    case 'PROVIDER_NOTIFIED':
      return { providerNotifiedAt: now };
    case 'ACCEPTED':
      return { acceptedAt: now };
    case 'ON_THE_WAY':
      return { onTheWayAt: now };
    case 'ARRIVED':
      return { arrivedAt: now };
    case 'IN_PROGRESS':
      return { startedAt: now };
    case 'COMPLETED':
      return { completedAt: now };
    case 'CANCELLED':
      return { cancelledAt: now };
    default:
      return {};
  }
}

export async function transitionBooking(input: TransitionInput): Promise<TransitionResult> {
  const actor = resolveActor(input.actorRole);
  const commissionRateBp = await getSetting('platform.commissionRateBp');
  const guaranteeEnabled = await getSetting('guarantee.enabled');

  const result = await prisma.$transaction(async (tx) => {
    // Lock the row for the duration of the transaction so two concurrent
    // actions (say, provider completing while admin cancels) cannot both win.
    const locked = await tx.$queryRaw<Array<{ id: string; status: BookingStatus }>>`
      SELECT "id", "status" FROM "Booking" WHERE "id" = ${input.bookingId}::uuid FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new AppError('NOT_FOUND', 'Booking not found.');

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: { service: { select: { guaranteeEligible: true, guaranteeDaysOverride: true } } },
    });

    const from = booking.status;
    assertTransition(from, input.to, actor);

    const now = new Date();
    const patch: Prisma.BookingUpdateInput = {
      status: input.to,
      ...timestampPatch(input.to, now),
      ...input.patch,
    };

    if (input.to === 'CANCELLED') {
      patch.cancelledByUserId = input.actorUserId ?? null;
      patch.cancellationReason = input.reason ?? null;
    }

    // -------- status-specific invariants and derived values --------------

    if (input.to === 'ACCEPTED' && !booking.providerId && !patch.provider) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        'A provider must be assigned before the booking can be accepted.',
      );
    }

    if (input.to === 'SCHEDULED' && !booking.scheduledFor && !patch.scheduledFor) {
      throw new AppError('VALIDATION_ERROR', 'A time is required to confirm the schedule.');
    }

    if (input.to === 'COMPLETED') {
      // A completed job must have an agreed price. Either the customer approved
      // a quote, or the caller supplies the final total explicitly (admin).
      const finalTotal =
        typeof patch.finalTotalPaisa === 'number'
          ? patch.finalTotalPaisa
          : (booking.approvedTotalPaisa ?? null);

      if (finalTotal === null) {
        throw new AppError(
          'QUOTE_REQUIRED',
          'The customer’s approved quote is required before the work can be completed.',
        );
      }

      // Membership benefits are read from the member's own row and applied
      // here, in the transaction that freezes the total. As with commission,
      // nothing the client sends can influence what comes off the bill.
      //
      // The emergency fee is excluded from the discount base — that money is
      // the technician's for turning out at night, not ours to discount. A plan
      // can cover it separately through its waiver.
      const benefits = await activeBenefitsFor(booking.customerId, tx);
      const waivedEmergencyPaisa = emergencyFeeWaiverPaisa(benefits, booking.emergencyFeePaisa);
      const discountBase = Math.max(
        0,
        finalTotal - booking.emergencyFeePaisa - booking.discountPaisa,
      );
      const { discountPaisa: memberDiscount } = memberDiscountPaisa(benefits, discountBase);
      const membershipSavings = memberDiscount + waivedEmergencyPaisa;

      const gross = Math.max(0, finalTotal - booking.discountPaisa - membershipSavings);
      const { commissionPaisa, providerEarningsPaisa } = splitCommission(gross, commissionRateBp);

      patch.finalTotalPaisa = finalTotal;
      patch.membershipDiscountPaisa = membershipSavings;
      if (benefits) patch.membership = { connect: { id: benefits.membershipId } };
      // Commission is computed here, server-side, and frozen onto the booking.
      patch.commissionRateBp = commissionRateBp;
      patch.commissionPaisa = commissionPaisa;
      patch.providerEarningsPaisa = providerEarningsPaisa;

      // Guarantee eligibility is decided at completion using the settings and
      // service flags in force at that moment, then frozen onto the booking.
      const excluded = await getSetting('guarantee.excludedServiceSlugs');
      const serviceRow = await tx.service.findUniqueOrThrow({
        where: { id: booking.serviceId },
        select: { slug: true, guaranteeEligible: true, guaranteeDaysOverride: true },
      });
      const days = serviceRow.guaranteeDaysOverride ?? (await getSetting('guarantee.days'));
      const eligible =
        guaranteeEnabled && serviceRow.guaranteeEligible && !excluded.includes(serviceRow.slug);

      // A plan's bonus days extend an existing guarantee; they never create one
      // on a service that is not covered. Selling cover on an excluded service
      // would be exactly the kind of promise this product does not make.
      const guaranteeDays = eligible ? days + (benefits?.guaranteeBonusDays ?? 0) : 0;

      patch.guaranteeEligible = eligible;
      patch.guaranteeDays = guaranteeDays;
      patch.guaranteeExpiresAt = eligible
        ? new Date(now.getTime() + guaranteeDays * 24 * 60 * 60 * 1000)
        : null;

      // Ledger: what the membership actually paid out on this booking, so a
      // line on a receipt can always be traced back to the plan that granted it.
      if (benefits) {
        const entries: Array<{
          kind: 'DISCOUNT' | 'EMERGENCY_FEE_WAIVER' | 'GUARANTEE_EXTENSION';
          amountPaisa: number;
          days: number;
        }> = [];
        if (memberDiscount > 0) {
          entries.push({ kind: 'DISCOUNT', amountPaisa: memberDiscount, days: 0 });
        }
        if (waivedEmergencyPaisa > 0) {
          entries.push({
            kind: 'EMERGENCY_FEE_WAIVER',
            amountPaisa: waivedEmergencyPaisa,
            days: 0,
          });
        }
        if (eligible && benefits.guaranteeBonusDays > 0) {
          entries.push({
            kind: 'GUARANTEE_EXTENSION',
            amountPaisa: 0,
            days: benefits.guaranteeBonusDays,
          });
        }
        for (const entry of entries) {
          await tx.membershipBenefit.upsert({
            where: { bookingId_kind: { bookingId: booking.id, kind: entry.kind } },
            create: { membershipId: benefits.membershipId, bookingId: booking.id, ...entry },
            update: { membershipId: benefits.membershipId, ...entry },
          });
        }
      }
    }

    const updated = await tx.booking.update({ where: { id: booking.id }, data: patch });

    await tx.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: from,
        toStatus: input.to,
        changedByUserId: input.actorUserId ?? null,
        changedByRole: input.actorRole === 'SYSTEM' ? null : input.actorRole,
        reason: input.reason ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });

    await applyCounterSideEffects(tx, updated, from, input.to);

    return { booking: updated, from, to: input.to };
  });

  await recordAudit({
    action: AUDIT_ACTIONS.BOOKING_STATUS_CHANGED,
    entity: 'Booking',
    entityId: result.booking.id,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole === 'SYSTEM' ? null : input.actorRole,
    metadata: { from: result.from, to: result.to, reason: input.reason ?? null },
  });

  return result;
}

/**
 * Maintain denormalised counters used by the matcher and dashboards. Kept in
 * the same transaction as the status change so they cannot drift.
 */
async function applyCounterSideEffects(
  tx: Tx,
  booking: Booking,
  from: BookingStatus,
  to: BookingStatus,
): Promise<void> {
  if (to === 'COMPLETED' && booking.providerId) {
    await tx.providerProfile.update({
      where: { id: booking.providerId },
      data: { completedJobs: { increment: 1 } },
    });
    await tx.customerProfile.updateMany({
      where: { userId: booking.customerId },
      data: { completedBookings: { increment: 1 } },
    });
  }

  if (to === 'CANCELLED') {
    await tx.customerProfile.updateMany({
      where: { userId: booking.customerId },
      data: { cancelledBookings: { increment: 1 } },
    });
    if (booking.providerId) {
      // Only count against the provider when they had already committed.
      const providerHadCommitted = from !== 'PENDING' && from !== 'PROVIDER_NOTIFIED';
      if (providerHadCommitted) {
        await tx.providerProfile.update({
          where: { id: booking.providerId },
          data: { cancelledJobs: { increment: 1 } },
        });
      }
    }
    // Release any outstanding offers so the job stops appearing in inboxes.
    await tx.bookingOffer.updateMany({
      where: { bookingId: booking.id, respondedAt: null },
      data: { respondedAt: new Date(), accepted: false, declineReason: 'booking_cancelled' },
    });
  }
}
