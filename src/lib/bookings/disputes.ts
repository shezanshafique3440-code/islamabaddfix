import type { Dispute, DisputeReason, DisputeStatus, GuaranteeClaim, Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { disputeReference, guaranteeReference } from '../ids';
import { getSetting } from '../settings';
import { formatPaisa } from '../money';
import { notify, notifyAdmins, notifyMany, NOTIFICATION_EVENTS } from '../notifications';
import { refundPayment } from '../payments';
import { transitionBooking } from './transition';

/**
 * Disputes and guarantee claims.
 *
 * Both are customer-initiated escalations that only staff can resolve, and both
 * write to the audit log on every decision. Neither promises an outcome: the
 * guarantee in particular is checked against the eligibility that was frozen
 * onto the booking at completion, not against marketing copy.
 */

// ============================== disputes ==================================

export async function openDispute(params: {
  bookingId: string;
  raisedByUserId: string;
  reason: DisputeReason;
  description: string;
  fileIds?: string[];
}): Promise<Dispute> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: {
      id: true,
      reference: true,
      customerId: true,
      status: true,
      provider: { select: { userId: true } },
      service: { select: { name: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  if (booking.customerId !== params.raisedByUserId) {
    throw new AppError('FORBIDDEN', 'Sirf booking ka customer dispute khol sakta hai.');
  }

  const open = await prisma.dispute.findFirst({
    where: {
      bookingId: booking.id,
      status: { notIn: ['CLOSED', 'RESOLVED_NO_ACTION', 'RESOLVED_REFUND', 'RESOLVED_PARTIAL_REFUND', 'RESOLVED_REVISIT'] },
    },
  });
  if (open) {
    throw new AppError('DISPUTE_ALREADY_OPEN', 'Is booking par pehle se ek dispute khula hai.');
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: {
        reference: disputeReference(),
        bookingId: booking.id,
        raisedByUserId: params.raisedByUserId,
        reason: params.reason,
        description: params.description.trim(),
        status: 'OPEN',
      },
    });

    if (params.fileIds?.length) {
      await tx.uploadedFile.updateMany({
        where: {
          id: { in: params.fileIds },
          ownerId: params.raisedByUserId,
          purpose: 'DISPUTE_EVIDENCE',
          disputeId: null,
          deletedAt: null,
        },
        data: { disputeId: created.id },
      });
    }

    // Conversation thread so customer, provider and staff have one place to talk.
    await tx.conversation.create({
      data: {
        kind: 'DISPUTE',
        disputeId: created.id,
        bookingId: booking.id,
        subject: `Dispute ${created.reference}`,
      },
    });

    return created;
  });

  // A completed booking moves to DISPUTED; earlier statuses stay as they are so
  // the job can still be finished while the complaint is investigated.
  if (booking.status === 'COMPLETED') {
    await transitionBooking({
      bookingId: booking.id,
      to: 'DISPUTED',
      actorRole: 'CUSTOMER',
      actorUserId: params.raisedByUserId,
      reason: `Dispute ${dispute.reference} opened`,
      metadata: { disputeId: dispute.id, reason: params.reason },
    });
  }

  await notifyAdmins({
    event: NOTIFICATION_EVENTS.DISPUTE_OPENED,
    title: `Naya dispute — ${dispute.reference}`,
    body: `${booking.reference} (${booking.service.name}) par shikayat: ${DISPUTE_REASON_LABELS[params.reason].en}.`,
    href: `/admin/disputes/${dispute.id}`,
    data: { disputeId: dispute.id, bookingId: booking.id },
  });

  if (booking.provider?.userId) {
    await notify({
      event: NOTIFICATION_EVENTS.DISPUTE_OPENED,
      userId: booking.provider.userId,
      title: 'Booking par shikayat darj hui',
      body: `${booking.reference} par customer ne shikayat ki hai. Ops team rabta karegi.`,
      href: `/provider/jobs/${booking.id}`,
      data: { disputeId: dispute.id, bookingId: booking.id },
    });
  }

  return dispute;
}

export interface ResolveDisputeInput {
  disputeId: string;
  actorUserId: string;
  actorRole: Role;
  status: Extract<
    DisputeStatus,
    | 'UNDER_REVIEW'
    | 'AWAITING_CUSTOMER'
    | 'AWAITING_PROVIDER'
    | 'RESOLVED_REFUND'
    | 'RESOLVED_PARTIAL_REFUND'
    | 'RESOLVED_REVISIT'
    | 'RESOLVED_NO_ACTION'
    | 'CLOSED'
  >;
  notes?: string;
  /** Required for the refund outcomes. */
  refundPaisa?: number;
}

/**
 * Staff decision on a dispute.
 *
 * Refund outcomes actually move the Payment row through the payment
 * abstraction — the dispute cannot be marked refunded without that happening.
 */
export async function resolveDispute(input: ResolveDisputeInput): Promise<{
  dispute: Dispute;
  refundInstructions?: string;
}> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    include: {
      booking: {
        select: {
          id: true,
          reference: true,
          customerId: true,
          status: true,
          finalTotalPaisa: true,
          provider: { select: { userId: true } },
          payments: {
            where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });
  if (!dispute) throw new AppError('NOT_FOUND', 'Dispute nahi mila.');

  const isRefund =
    input.status === 'RESOLVED_REFUND' || input.status === 'RESOLVED_PARTIAL_REFUND';

  let refundInstructions: string | undefined;
  let refundedPaisa = 0;

  if (isRefund) {
    const payment = dispute.booking.payments[0];
    if (!payment) {
      throw new AppError(
        'CONFLICT',
        'Is booking par koi paid payment nahi hai, is liye refund record nahi ho sakta.',
      );
    }
    const amount =
      input.status === 'RESOLVED_REFUND'
        ? payment.amountPaisa - payment.refundedPaisa
        : (input.refundPaisa ?? 0);
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Partial refund ke liye valid amount dein.');
    }

    const result = await refundPayment({
      paymentId: payment.id,
      amountPaisa: amount,
      reason: `Dispute ${dispute.reference}: ${input.notes ?? 'resolved by ops'}`,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
    });
    refundInstructions = result.instructions;
    refundedPaisa = amount;
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: input.status,
      resolutionNotes: input.notes?.trim() || null,
      refundPaisa: refundedPaisa > 0 ? dispute.refundPaisa + refundedPaisa : dispute.refundPaisa,
      ...(isTerminal(input.status)
        ? { resolvedByUserId: input.actorUserId, resolvedAt: new Date() }
        : {}),
    },
  });

  // Move the booking out of DISPUTED once the dispute reaches a conclusion.
  if (isTerminal(input.status) && dispute.booking.status === 'DISPUTED') {
    const bookingTarget = input.status === 'RESOLVED_REFUND' ? 'REFUNDED' : 'COMPLETED';
    await transitionBooking({
      bookingId: dispute.booking.id,
      to: bookingTarget,
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      reason: `Dispute ${dispute.reference} resolved as ${input.status}`,
      metadata: { disputeId: dispute.id, refundedPaisa },
    });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.DISPUTE_RESOLVED,
    entity: 'Dispute',
    entityId: dispute.id,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    metadata: {
      bookingId: dispute.booking.id,
      status: input.status,
      refundedPaisa,
      notes: input.notes ?? null,
    },
  });

  const audience = [dispute.booking.customerId];
  if (dispute.booking.provider?.userId) audience.push(dispute.booking.provider.userId);
  await notifyMany(audience, {
    event: NOTIFICATION_EVENTS.DISPUTE_UPDATE,
    title: `Dispute update — ${dispute.reference}`,
    body:
      refundedPaisa > 0
        ? `Faisla: ${DISPUTE_STATUS_LABELS[input.status].ur}. Refund: ${formatPaisa(refundedPaisa)}.`
        : `Faisla: ${DISPUTE_STATUS_LABELS[input.status].ur}.`,
    href: `/account/bookings/${dispute.booking.id}`,
    data: { disputeId: dispute.id },
  });

  return { dispute: updated, refundInstructions };
}

function isTerminal(status: DisputeStatus): boolean {
  return (
    status === 'RESOLVED_REFUND' ||
    status === 'RESOLVED_PARTIAL_REFUND' ||
    status === 'RESOLVED_REVISIT' ||
    status === 'RESOLVED_NO_ACTION' ||
    status === 'CLOSED'
  );
}

export const DISPUTE_REASON_LABELS: Record<DisputeReason, { en: string; ur: string }> = {
  TECHNICIAN_NO_SHOW: { en: 'Technician did not arrive', ur: 'Technician nahi aaya' },
  POOR_SERVICE: { en: 'Poor service quality', ur: 'Kaam theek nahi hua' },
  WRONG_PRICE: { en: 'Wrong price charged', ur: 'Ghalat qeemat li gayi' },
  UNAUTHORIZED_CHARGE: { en: 'Unauthorized extra charge', ur: 'Bina ijazat extra charge' },
  DAMAGE: { en: 'Damage caused', ur: 'Nuqsan hua' },
  OTHER: { en: 'Other', ur: 'Koi aur wajah' },
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, { en: string; ur: string }> = {
  OPEN: { en: 'Open', ur: 'Khula hai' },
  UNDER_REVIEW: { en: 'Under review', ur: 'Jaiza liya ja raha hai' },
  AWAITING_CUSTOMER: { en: 'Awaiting customer', ur: 'Customer ke jawab ka intezar' },
  AWAITING_PROVIDER: { en: 'Awaiting provider', ur: 'Technician ke jawab ka intezar' },
  RESOLVED_REFUND: { en: 'Resolved — full refund', ur: 'Poora refund' },
  RESOLVED_PARTIAL_REFUND: { en: 'Resolved — partial refund', ur: 'Juzvi refund' },
  RESOLVED_REVISIT: { en: 'Resolved — re-visit approved', ur: 'Dobara visit manzoor' },
  RESOLVED_NO_ACTION: { en: 'Resolved — no action', ur: 'Koi karwai nahi' },
  CLOSED: { en: 'Closed', ur: 'Band' },
};

// ========================== guarantee claims ==============================

/**
 * Customer claims the Fix Guarantee.
 *
 * Eligibility is read from the booking's frozen guarantee fields — the platform
 * never retroactively decides a job was covered, in either direction.
 */
export async function submitGuaranteeClaim(params: {
  bookingId: string;
  raisedByUserId: string;
  description: string;
  fileIds?: string[];
}): Promise<GuaranteeClaim> {
  const enabled = await getSetting('guarantee.enabled');
  if (!enabled) {
    throw new AppError('GUARANTEE_NOT_ELIGIBLE', 'Guarantee program is waqt band hai.');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: {
      id: true,
      reference: true,
      customerId: true,
      status: true,
      guaranteeEligible: true,
      guaranteeExpiresAt: true,
      guaranteeDays: true,
      provider: { select: { userId: true } },
      service: { select: { name: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  if (booking.customerId !== params.raisedByUserId) {
    throw new AppError('FORBIDDEN', 'Sirf booking ka customer claim kar sakta hai.');
  }
  if (!booking.guaranteeEligible) {
    throw new AppError(
      'GUARANTEE_NOT_ELIGIBLE',
      'Is booking par service guarantee laagu nahi thi.',
    );
  }
  if (!booking.guaranteeExpiresAt || booking.guaranteeExpiresAt < new Date()) {
    throw new AppError(
      'GUARANTEE_EXPIRED',
      `Guarantee ki muddat (${booking.guaranteeDays} din) khatam ho chuki hai.`,
    );
  }

  const existing = await prisma.guaranteeClaim.findFirst({
    where: { bookingId: booking.id, status: { notIn: ['REJECTED', 'RESOLVED'] } },
  });
  if (existing) {
    throw new AppError('CONFLICT', 'Is booking par pehle se ek claim zer-e-ghaur hai.');
  }

  const claim = await prisma.$transaction(async (tx) => {
    const created = await tx.guaranteeClaim.create({
      data: {
        reference: guaranteeReference(),
        bookingId: booking.id,
        raisedByUserId: params.raisedByUserId,
        description: params.description.trim(),
        status: 'SUBMITTED',
      },
    });
    if (params.fileIds?.length) {
      await tx.uploadedFile.updateMany({
        where: {
          id: { in: params.fileIds },
          ownerId: params.raisedByUserId,
          purpose: 'GUARANTEE_EVIDENCE',
          guaranteeClaimId: null,
          deletedAt: null,
        },
        data: { guaranteeClaimId: created.id },
      });
    }
    return created;
  });

  await notifyAdmins({
    event: NOTIFICATION_EVENTS.GUARANTEE_UPDATE,
    title: `Guarantee claim — ${claim.reference}`,
    body: `${booking.reference} (${booking.service.name}) par re-visit claim aaya hai.`,
    href: `/admin/guarantees/${claim.id}`,
    data: { claimId: claim.id, bookingId: booking.id },
  });

  return claim;
}

/** Staff decision on a guarantee claim, optionally scheduling the re-visit. */
export async function decideGuaranteeClaim(params: {
  claimId: string;
  actorUserId: string;
  actorRole: Role;
  status: Extract<
    GuaranteeClaim['status'],
    'UNDER_REVIEW' | 'APPROVED' | 'REVISIT_SCHEDULED' | 'RESOLVED' | 'REJECTED'
  >;
  notes?: string;
  revisitScheduledFor?: Date | null;
  providerResponsible?: boolean;
}): Promise<GuaranteeClaim> {
  const claim = await prisma.guaranteeClaim.findUnique({
    where: { id: params.claimId },
    include: {
      booking: {
        select: {
          id: true,
          reference: true,
          customerId: true,
          provider: { select: { userId: true } },
        },
      },
    },
  });
  if (!claim) throw new AppError('NOT_FOUND', 'Claim nahi mila.');

  const defaultResponsibility = await getSetting('guarantee.providerResponsibleByDefault');

  const updated = await prisma.guaranteeClaim.update({
    where: { id: claim.id },
    data: {
      status: params.status,
      reviewNotes: params.notes?.trim() || null,
      revisitScheduledFor: params.revisitScheduledFor ?? claim.revisitScheduledFor,
      providerResponsible: params.providerResponsible ?? defaultResponsibility,
      ...(params.status === 'APPROVED' ||
      params.status === 'REJECTED' ||
      params.status === 'RESOLVED'
        ? { decidedByUserId: params.actorUserId, decidedAt: new Date() }
        : {}),
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.GUARANTEE_DECIDED,
    entity: 'GuaranteeClaim',
    entityId: claim.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: {
      bookingId: claim.booking.id,
      status: params.status,
      providerResponsible: updated.providerResponsible,
      notes: params.notes ?? null,
    },
  });

  const audience = [claim.booking.customerId];
  if (claim.booking.provider?.userId) audience.push(claim.booking.provider.userId);
  await notifyMany(audience, {
    event: NOTIFICATION_EVENTS.GUARANTEE_UPDATE,
    title: `Guarantee claim update — ${claim.reference}`,
    body: `${claim.booking.reference}: claim ka status ab "${GUARANTEE_STATUS_LABELS[params.status].ur}" hai.`,
    href: `/account/bookings/${claim.booking.id}`,
    data: { claimId: claim.id },
  });

  return updated;
}

export const GUARANTEE_STATUS_LABELS: Record<
  GuaranteeClaim['status'],
  { en: string; ur: string }
> = {
  SUBMITTED: { en: 'Submitted', ur: 'Jama ho gaya' },
  UNDER_REVIEW: { en: 'Under review', ur: 'Jaiza liya ja raha hai' },
  APPROVED: { en: 'Approved', ur: 'Manzoor' },
  REVISIT_SCHEDULED: { en: 'Re-visit scheduled', ur: 'Dobara visit ka time set' },
  RESOLVED: { en: 'Resolved', ur: 'Hal ho gaya' },
  REJECTED: { en: 'Rejected', ur: 'Manzoor nahi hua' },
};
