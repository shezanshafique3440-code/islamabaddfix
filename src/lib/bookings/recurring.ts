import type { RecurrenceFrequency, RecurringScheduleStatus } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { recurringReference } from '../ids';
import { notify, NOTIFICATION_EVENTS } from '../notifications';
import { getSetting } from '../settings';
import { createBooking } from './service';

/**
 * Standing arrangements: "clean the office every second Tuesday".
 *
 * A schedule is deliberately not a booking. It generates a real booking a few
 * days before each occurrence, which then goes through the ordinary matching,
 * quote and approval flow. Nothing about a recurring job is pre-approved or
 * pre-priced — the customer approves a written quote for every visit, exactly
 * as they would for a one-off.
 *
 * Generation is idempotent. It is driven by `nextOccurrenceAt` and guarded by a
 * uniqueness check on what has already been created, so running the generator
 * twice, or late, or on a machine whose clock jumped, cannot double-book anyone.
 */

/** How the customer's choice maps to an interval in days or months. */
const PERIODS: Record<RecurrenceFrequency, { unit: 'day' | 'month'; count: number }> = {
  WEEKLY: { unit: 'day', count: 7 },
  FORTNIGHTLY: { unit: 'day', count: 14 },
  MONTHLY: { unit: 'month', count: 1 },
  QUARTERLY: { unit: 'month', count: 3 },
};

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  WEEKLY: 'Every week',
  FORTNIGHTLY: 'Every two weeks',
  MONTHLY: 'Every month',
  QUARTERLY: 'Every three months',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Every two weeks on Tuesday at 10:00". */
export function describeSchedule(schedule: {
  frequency: RecurrenceFrequency;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDayMinutes: number;
}): string {
  const every =
    schedule.intervalCount > 1
      ? `Every ${schedule.intervalCount} × ${FREQUENCY_LABELS[schedule.frequency].toLowerCase()}`
      : FREQUENCY_LABELS[schedule.frequency];
  const when =
    schedule.dayOfWeek !== null
      ? ` on ${DAY_NAMES[schedule.dayOfWeek] ?? ''}`
      : schedule.dayOfMonth !== null
        ? ` on day ${schedule.dayOfMonth}`
        : '';
  const hours = Math.floor(schedule.timeOfDayMinutes / 60);
  const minutes = schedule.timeOfDayMinutes % 60;
  const time = ` at ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return `${every}${when}${time}`;
}

/**
 * The first occurrence at or after `from` that matches the schedule.
 *
 * Monthly days are capped at 28 by validation, so there is no February problem
 * to paper over — every month has a 28th.
 */
export function firstOccurrenceOnOrAfter(
  from: Date,
  rule: {
    frequency: RecurrenceFrequency;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    timeOfDayMinutes: number;
  },
): Date {
  const candidate = new Date(from);
  candidate.setHours(Math.floor(rule.timeOfDayMinutes / 60), rule.timeOfDayMinutes % 60, 0, 0);

  const period = PERIODS[rule.frequency];
  if (period.unit === 'day' && rule.dayOfWeek !== null) {
    const delta = (rule.dayOfWeek - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + delta);
    // Same day but the time has already gone: take the following week.
    if (candidate < from) candidate.setDate(candidate.getDate() + 7);
    return candidate;
  }
  if (period.unit === 'month' && rule.dayOfMonth !== null) {
    candidate.setDate(rule.dayOfMonth);
    if (candidate < from) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
  }
  if (candidate < from) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

/** Advance one interval from a given occurrence. */
export function nextOccurrenceAfter(
  occurrence: Date,
  rule: { frequency: RecurrenceFrequency; intervalCount: number },
): Date {
  const period = PERIODS[rule.frequency];
  const next = new Date(occurrence);
  const steps = Math.max(1, rule.intervalCount);
  if (period.unit === 'day') next.setDate(next.getDate() + period.count * steps);
  else next.setMonth(next.getMonth() + period.count * steps);
  return next;
}

// ------------------------------------------------------------ lifecycle ----

export interface ScheduleInput {
  customerId: string;
  serviceId: string;
  addressId: string;
  providerId?: string | null;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  timeOfDayMinutes: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  problemDescription: string;
  customerNotes?: string | null;
  startsOn?: Date | null;
  maxOccurrences?: number | null;
  endsAt?: Date | null;
}

export async function createSchedule(input: ScheduleInput) {
  const enabled = await getSetting('recurring.enabled');
  if (!enabled) {
    throw new AppError('BOOKING_NOT_AVAILABLE', 'Repeat visits are not available right now.');
  }

  const [service, address] = await Promise.all([
    prisma.service.findFirst({
      where: { id: input.serviceId, isActive: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    // The address must belong to this customer — the same check that stops one
    // customer booking work at another's home applies to a standing order too.
    prisma.address.findFirst({
      where: { id: input.addressId, userId: input.customerId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!service) throw new AppError('NOT_FOUND', 'This service is not available right now.');
  if (!address) throw new AppError('NOT_FOUND', 'That address is not on your account.');

  const limit = await getSetting('recurring.maxPerCustomer');
  const live = await prisma.recurringSchedule.count({
    where: { customerId: input.customerId, status: { in: ['ACTIVE', 'PAUSED'] } },
  });
  if (live >= limit) {
    throw new AppError(
      'CONFLICT',
      `You can have up to ${limit} repeat visits set up. End one before adding another.`,
    );
  }

  const start = input.startsOn ?? new Date();
  const nextOccurrenceAt = firstOccurrenceOnOrAfter(start, {
    frequency: input.frequency,
    dayOfWeek: input.dayOfWeek ?? null,
    dayOfMonth: input.dayOfMonth ?? null,
    timeOfDayMinutes: input.timeOfDayMinutes,
  });

  const schedule = await prisma.recurringSchedule.create({
    data: {
      reference: recurringReference(),
      customerId: input.customerId,
      serviceId: input.serviceId,
      addressId: input.addressId,
      providerId: input.providerId ?? null,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      timeOfDayMinutes: input.timeOfDayMinutes,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      problemDescription: input.problemDescription.trim(),
      customerNotes: input.customerNotes?.trim() || null,
      nextOccurrenceAt,
      maxOccurrences: input.maxOccurrences ?? null,
      endsAt: input.endsAt ?? null,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.RECURRING_CREATED,
    entity: 'RecurringSchedule',
    entityId: schedule.id,
    actorUserId: input.customerId,
    metadata: { reference: schedule.reference, frequency: schedule.frequency },
  });

  return schedule;
}

export async function setScheduleStatus(params: {
  scheduleId: string;
  actorUserId: string;
  actorIsAdmin?: boolean;
  status: Extract<RecurringScheduleStatus, 'ACTIVE' | 'PAUSED' | 'ENDED'>;
  reason?: string;
}) {
  const schedule = await prisma.recurringSchedule.findUnique({
    where: { id: params.scheduleId },
    select: {
      id: true,
      customerId: true,
      status: true,
      reference: true,
      frequency: true,
      intervalCount: true,
      dayOfWeek: true,
      dayOfMonth: true,
      timeOfDayMinutes: true,
      nextOccurrenceAt: true,
    },
  });
  if (!schedule) throw new AppError('NOT_FOUND', 'Repeat visit not found.');
  if (!params.actorIsAdmin && schedule.customerId !== params.actorUserId) {
    throw new AppError('FORBIDDEN', 'This repeat visit is not yours.');
  }
  if (schedule.status === 'ENDED') {
    throw new AppError('CONFLICT', 'This repeat visit has already ended.');
  }

  const now = new Date();
  // Resuming after a pause must not fire every occurrence that was missed:
  // move the next one forward to the first that is still in the future.
  const nextOccurrenceAt =
    params.status === 'ACTIVE' && schedule.nextOccurrenceAt < now
      ? firstOccurrenceOnOrAfter(now, schedule)
      : schedule.nextOccurrenceAt;

  const updated = await prisma.recurringSchedule.update({
    where: { id: schedule.id },
    data: {
      status: params.status,
      nextOccurrenceAt,
      pausedAt: params.status === 'PAUSED' ? now : null,
      endedAt: params.status === 'ENDED' ? now : null,
      endedReason: params.status === 'ENDED' ? (params.reason ?? null) : null,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.RECURRING_STATUS_CHANGED,
    entity: 'RecurringSchedule',
    entityId: schedule.id,
    actorUserId: params.actorUserId,
    metadata: { reference: schedule.reference, from: schedule.status, to: params.status },
  });

  return updated;
}

export async function schedulesFor(customerId: string) {
  return prisma.recurringSchedule.findMany({
    where: { customerId, status: { not: 'ENDED' } },
    orderBy: { nextOccurrenceAt: 'asc' },
    include: {
      service: { select: { name: true, slug: true } },
      address: { select: { label: true, addressLine: true } },
      provider: { select: { businessName: true, slug: true } },
      _count: { select: { bookings: true } },
    },
  });
}

// ------------------------------------------------------------ generation ----

export interface GenerationReport {
  created: number;
  ended: number;
  skipped: number;
  errors: Array<{ scheduleId: string; reference: string; message: string }>;
}

/**
 * Create the bookings that are now due, and retire schedules that have run out.
 *
 * Safe to call repeatedly: each occurrence is written only if no booking for
 * this schedule already exists at that time, and `nextOccurrenceAt` only ever
 * moves forward.
 */
export async function generateDueBookings(now = new Date()): Promise<GenerationReport> {
  const [enabled, leadDays] = await Promise.all([
    getSetting('recurring.enabled'),
    getSetting('recurring.leadDays'),
  ]);
  const report: GenerationReport = { created: 0, ended: 0, skipped: 0, errors: [] };
  if (!enabled) return report;

  const horizon = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);

  const due = await prisma.recurringSchedule.findMany({
    where: { status: 'ACTIVE', nextOccurrenceAt: { lte: horizon } },
    orderBy: { nextOccurrenceAt: 'asc' },
    take: 200,
  });

  for (const schedule of due) {
    // Stopping conditions are checked before generating, not after, so a
    // schedule never overshoots the count the customer agreed to.
    const exhausted =
      (schedule.maxOccurrences !== null &&
        schedule.occurrencesCreated >= schedule.maxOccurrences) ||
      (schedule.endsAt !== null && schedule.nextOccurrenceAt > schedule.endsAt);
    if (exhausted) {
      await prisma.recurringSchedule.update({
        where: { id: schedule.id },
        data: { status: 'ENDED', endedAt: now, endedReason: 'Reached its end' },
      });
      await notifyScheduleEnded(schedule.customerId, schedule.reference);
      report.ended += 1;
      continue;
    }

    // Idempotence: if this occurrence already produced a booking, only advance.
    const already = await prisma.booking.findFirst({
      where: { recurringScheduleId: schedule.id, scheduledFor: schedule.nextOccurrenceAt },
      select: { id: true },
    });
    if (already) {
      await advance(schedule.id, schedule.nextOccurrenceAt, schedule);
      report.skipped += 1;
      continue;
    }

    try {
      const result = await createBooking({
        customerId: schedule.customerId,
        serviceId: schedule.serviceId,
        addressId: schedule.addressId,
        providerId: schedule.providerId,
        problemDescription: schedule.problemDescription,
        customerNotes: schedule.customerNotes ?? undefined,
        scheduledFor: schedule.nextOccurrenceAt,
      });
      await prisma.booking.update({
        where: { id: result.booking.id },
        data: { recurringScheduleId: schedule.id },
      });
      await prisma.recurringSchedule.update({
        where: { id: schedule.id },
        data: { occurrencesCreated: { increment: 1 }, lastGeneratedAt: now },
      });
      await advance(schedule.id, schedule.nextOccurrenceAt, schedule);
      report.created += 1;
    } catch (error) {
      // A single broken schedule (deleted address, retired service) must not
      // stop the rest of the run. Record it and move on; the customer is told.
      const message = error instanceof Error ? error.message : 'Unknown error';
      report.errors.push({
        scheduleId: schedule.id,
        reference: schedule.reference,
        message,
      });
      await prisma.recurringSchedule.update({
        where: { id: schedule.id },
        data: { status: 'PAUSED', pausedAt: now },
      });
      await notify({
        event: NOTIFICATION_EVENTS.RECURRING_PAUSED,
        userId: schedule.customerId,
        title: 'A repeat visit needs your attention',
        body: `We could not book ${schedule.reference} this time: ${message} It is paused until you fix it.`,
        href: '/account/recurring',
        data: { scheduleId: schedule.id },
      });
    }
  }

  return report;
}

async function advance(
  scheduleId: string,
  from: Date,
  rule: { frequency: RecurrenceFrequency; intervalCount: number },
): Promise<void> {
  await prisma.recurringSchedule.update({
    where: { id: scheduleId },
    data: { nextOccurrenceAt: nextOccurrenceAfter(from, rule) },
  });
}

async function notifyScheduleEnded(userId: string, reference: string): Promise<void> {
  await notify({
    event: NOTIFICATION_EVENTS.RECURRING_ENDED,
    userId,
    title: 'A repeat visit has finished',
    body: `${reference} has run its course. Set up a new one whenever you need it.`,
    href: '/account/recurring',
    data: { reference },
  });
}
