import type { Booking, Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { isStaff } from '../auth/rbac';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { getSettings } from '../settings';
import { notify, NOTIFICATION_EVENTS } from '../notifications';
import { formatDateTime } from '../utils';
import { assertScheduleWindow } from './service';

/**
 * Move a booking to a different time.
 *
 * Before this existed the only way to change a time was to cancel and rebook,
 * which loses the technician who already accepted — the worst outcome for
 * everybody. So: either party may move a job that has not set off yet, the
 * other side is told immediately, and every move is audited.
 *
 * Deliberately *not* a propose-and-accept negotiation. That needs its own state
 * and a way to expire a proposal, and the simpler rule already protects the
 * party who did not ask for it: the new time still has to clear the platform's
 * lead-time window, moves are capped, and a provider who cannot make the new
 * time can decline the job exactly as they could before.
 */

/** Statuses where nobody is travelling yet, so a time change costs nothing. */
const RESCHEDULABLE = [
  'PENDING',
  'PROVIDER_NOTIFIED',
  'ACCEPTED',
  'QUOTE_PENDING',
  'QUOTE_APPROVED',
  'SCHEDULED',
] as const;

/** A booking that keeps moving is a booking nobody is committed to. */
const MAX_RESCHEDULES = 3;

export interface RescheduleInput {
  bookingId: string;
  actorUserId: string;
  actorRole: Role;
  /** Present when the actor is a provider, for the ownership check. */
  actorProviderId?: string;
  scheduledFor: Date;
  reason?: string;
}

export async function rescheduleBooking(input: RescheduleInput): Promise<Booking> {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      customerId: true,
      providerId: true,
      status: true,
      scheduledFor: true,
      isEmergency: true,
      service: { select: { name: true } },
      provider: { select: { userId: true, businessName: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');

  const staff = isStaff(input.actorRole);
  const isCustomer = booking.customerId === input.actorUserId;
  const isProvider =
    input.actorProviderId !== undefined && booking.providerId === input.actorProviderId;
  if (!staff && !isCustomer && !isProvider) {
    throw new AppError('NOT_FOUND', 'Booking not found.');
  }

  if (!RESCHEDULABLE.includes(booking.status as (typeof RESCHEDULABLE)[number])) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      'The technician has set off or the work has started, so the time can no longer be changed. Cancel it, or contact support.',
    );
  }

  // An emergency is "now" by definition; scheduling one for Thursday is a
  // different job, not the same one at a different time.
  if (booking.isEmergency) {
    throw new AppError(
      'CONFLICT',
      'An emergency booking cannot be moved. Cancel it and book a normal visit instead.',
    );
  }

  const [minLeadMinutes, maxLeadDays] = await getSettings([
    'booking.minLeadMinutes',
    'booking.maxLeadDays',
  ]);
  assertScheduleWindow(input.scheduledFor, { minLeadMinutes, maxLeadDays, isEmergency: false });

  if (booking.scheduledFor && booking.scheduledFor.getTime() === input.scheduledFor.getTime()) {
    throw new AppError('VALIDATION_ERROR', 'The booking is already set to that time.');
  }

  // Count from the audit log rather than carrying a column: the history is
  // already the record, and one less migration is one less thing to get wrong.
  const previousMoves = await prisma.auditLog.count({
    where: { entity: 'Booking', entityId: booking.id, action: AUDIT_ACTIONS.BOOKING_RESCHEDULED },
  });
  if (!staff && previousMoves >= MAX_RESCHEDULES) {
    throw new AppError(
      'CONFLICT',
      `A booking cannot be moved more than ${MAX_RESCHEDULES} times. Please contact support.`,
    );
  }

  const previous = booking.scheduledFor;
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { scheduledFor: input.scheduledFor },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.BOOKING_RESCHEDULED,
    entity: 'Booking',
    entityId: booking.id,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    metadata: {
      from: previous?.toISOString() ?? null,
      to: input.scheduledFor.toISOString(),
      reason: input.reason ?? null,
      by: staff ? 'ADMIN' : isCustomer ? 'CUSTOMER' : 'PROVIDER',
    },
  });

  // Whoever did not do it needs to know, immediately.
  const movedBy = staff
    ? 'Support team'
    : isCustomer
      ? 'Customer'
      : (booking.provider?.businessName ?? 'Technician');
  const when = formatDateTime(input.scheduledFor);

  const audience = new Set<string>();
  if (!isCustomer) audience.add(booking.customerId);
  if (!isProvider && booking.provider?.userId) audience.add(booking.provider.userId);

  await Promise.all(
    [...audience].map((userId) =>
      notify({
        event: NOTIFICATION_EVENTS.BOOKING_RESCHEDULED,
        userId,
        title: `Visit moved — ${booking.reference}`,
        body: `${movedBy} moved the ${booking.service.name} visit to ${when}.${
          input.reason ? ` Reason: ${input.reason}` : ''
        }`,
        href:
          userId === booking.provider?.userId
            ? `/provider/jobs/${booking.id}`
            : `/account/bookings/${booking.id}`,
        data: { bookingId: booking.id, scheduledFor: input.scheduledFor.toISOString() },
      }),
    ),
  );

  return updated;
}

/** How many moves this booking has left, for the UI to show before offering. */
export async function reschedulesRemaining(bookingId: string): Promise<number> {
  const used = await prisma.auditLog.count({
    where: { entity: 'Booking', entityId: bookingId, action: AUDIT_ACTIONS.BOOKING_RESCHEDULED },
  });
  return Math.max(0, MAX_RESCHEDULES - used);
}
