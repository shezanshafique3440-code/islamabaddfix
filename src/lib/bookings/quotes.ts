import type { BookingStatus, Quote, QuoteItemKind } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { formatPaisa } from '../money';
import { notify, NOTIFICATION_EVENTS } from '../notifications';
import { getSetting } from '../settings';
import { transitionBooking } from './transition';

/**
 * Quote system.
 *
 * Core rule: the price the customer sees is the price they agreed to. That is
 * enforced by three things —
 *  1. Totals are summed server-side from line items. A client-supplied total is
 *     ignored; there is no field for it.
 *  2. Any charge added after approval must be its own `isAdditional` quote,
 *     which needs a fresh customer approval before the job can complete.
 *  3. Booking.approvedTotalPaisa is only ever written by an approval here, and
 *     completion refuses to run without it.
 */

export interface QuoteItemInput {
  kind: QuoteItemKind;
  label: string;
  quantity?: number;
  unitPricePaisa: number;
}

const MAX_ITEMS = 20;

function sumItems(items: QuoteItemInput[]): number {
  return items.reduce(
    (total, item) => total + item.unitPricePaisa * Math.max(1, item.quantity ?? 1),
    0,
  );
}

/**
 * Statuses a job can be resumed at once an additional quote has been decided.
 * The agreed price already stands, so neither decision may rewind the job.
 */
const RESUMABLE_AFTER_QUOTE: readonly BookingStatus[] = [
  'QUOTE_APPROVED',
  'SCHEDULED',
  'ARRIVED',
  'IN_PROGRESS',
];

/**
 * Where the job was when a quote interrupted it.
 *
 * Read from BookingStatusHistory, which `transitionBooking` writes in the same
 * transaction as every status change — so this is the recorded interruption
 * point, not a guess. A revised quote submitted while the booking is already
 * QUOTE_PENDING writes no new row, so the original interruption point survives
 * any number of revisions.
 */
async function interruptedFrom(bookingId: string): Promise<BookingStatus | null> {
  const row = await prisma.bookingStatusHistory.findFirst({
    where: { bookingId, toStatus: 'QUOTE_PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { fromStatus: true },
  });
  return row?.fromStatus ?? null;
}

/**
 * Provider submits a quote. Works from ACCEPTED (initial quote), from ARRIVED
 * (revised after inspection), from QUOTE_APPROVED / SCHEDULED (extra cost found
 * before setting off) and from IN_PROGRESS (found mid-job) — in every case but
 * the first the quote is marked additional. Submitting again while a quote is
 * still undecided supersedes it rather than stacking a second live quote.
 */
export async function submitQuote(params: {
  bookingId: string;
  providerId: string;
  actorUserId: string;
  items: QuoteItemInput[];
  notes?: string;
  validUntil?: Date | null;
}): Promise<Quote> {
  if (params.items.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'A quote must have at least one item.');
  }
  if (params.items.length > MAX_ITEMS) {
    throw new AppError('VALIDATION_ERROR', `A quote cannot have more than ${MAX_ITEMS} items.`);
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: {
      service: { select: { name: true } },
      customer: { select: { id: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  if (booking.providerId !== params.providerId) {
    throw new AppError('FORBIDDEN', 'This booking is not assigned to you.');
  }

  const subtotalPaisa = sumItems(params.items);
  if (subtotalPaisa <= 0) {
    throw new AppError('VALIDATION_ERROR', 'The quote total must be more than zero.');
  }

  // Additional charges are those raised after the customer already approved a
  // price — mid-job, or after arriving and finding more work.
  const isAdditional = booking.approvedTotalPaisa !== null;

  const quote = await prisma.$transaction(async (tx) => {
    // Any earlier quote still awaiting a decision is superseded by this one.
    await tx.quote.updateMany({
      where: { bookingId: booking.id, status: 'SUBMITTED' },
      data: { status: 'SUPERSEDED' },
    });

    const created = await tx.quote.create({
      data: {
        bookingId: booking.id,
        providerId: params.providerId,
        status: 'SUBMITTED',
        isAdditional,
        subtotalPaisa,
        notes: params.notes?.trim() || null,
        validUntil: params.validUntil ?? null,
        submittedAt: new Date(),
        items: {
          create: params.items.map((item) => ({
            kind: item.kind,
            label: item.label.trim(),
            quantity: Math.max(1, item.quantity ?? 1),
            unitPricePaisa: item.unitPricePaisa,
          })),
        },
      },
      include: { items: true },
    });
    return created;
  });

  // A revision submitted before the customer decided leaves the status where it
  // is — the booking is already awaiting a decision, and re-entering the same
  // status would both fail the state machine and destroy the recorded
  // interruption point that the decision needs in order to resume the job.
  if (booking.status !== 'QUOTE_PENDING') {
    await transitionBooking({
      bookingId: booking.id,
      to: 'QUOTE_PENDING',
      actorRole: 'PROVIDER',
      actorUserId: params.actorUserId,
      reason: isAdditional ? 'Additional charges submitted' : 'Quote submitted',
      metadata: { quoteId: quote.id, subtotalPaisa },
    });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.QUOTE_SUBMITTED,
    entity: 'Quote',
    entityId: quote.id,
    actorUserId: params.actorUserId,
    actorRole: 'PROVIDER',
    metadata: { bookingId: booking.id, subtotalPaisa, isAdditional },
  });

  await notify({
    event: NOTIFICATION_EVENTS.QUOTE_RECEIVED,
    userId: booking.customerId,
    title: isAdditional ? 'Extra charges need your approval' : 'Your quote is ready',
    body: isAdditional
      ? `The technician has sent ${formatPaisa(subtotalPaisa)} in extra charges. The job cannot be completed until you approve them.`
      : `Quote for ${booking.service.name}: ${formatPaisa(subtotalPaisa)}. Review the breakdown, then approve or decline.`,
    href: `/account/bookings/${booking.id}`,
    data: { bookingId: booking.id, quoteId: quote.id, subtotalPaisa },
  });

  return quote;
}

/**
 * Customer approves a quote.
 *
 * For an initial quote this sets the agreed total; for an additional quote it is
 * added on top. Either way the booking moves on and the total is written here
 * and nowhere else.
 */
export async function approveQuote(params: {
  quoteId: string;
  customerUserId: string;
}): Promise<{ quote: Quote; approvedTotalPaisa: number }> {
  const quote = await prisma.quote.findUnique({
    where: { id: params.quoteId },
    include: {
      booking: {
        select: {
          id: true,
          customerId: true,
          status: true,
          approvedTotalPaisa: true,
          emergencyFeePaisa: true,
          reference: true,
        },
      },
      provider: { select: { userId: true, businessName: true } },
    },
  });
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.');
  if (quote.booking.customerId !== params.customerUserId) {
    throw new AppError('FORBIDDEN', 'This quote does not belong to your booking.');
  }
  if (quote.status !== 'SUBMITTED') {
    throw new AppError('QUOTE_NOT_PENDING', 'This quote can no longer be approved.');
  }
  if (quote.validUntil && quote.validUntil < new Date()) {
    throw new AppError('QUOTE_NOT_PENDING', 'This quote has expired.');
  }

  // Additional charges stack on the already-approved amount; an initial quote
  // also carries the emergency fee, which was disclosed before booking.
  const approvedTotalPaisa = quote.isAdditional
    ? (quote.booking.approvedTotalPaisa ?? 0) + quote.subtotalPaisa
    : quote.subtotalPaisa + quote.booking.emergencyFeePaisa;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'APPROVED', respondedAt: new Date() },
      include: { items: true },
    });
    await tx.booking.update({
      where: { id: quote.booking.id },
      data: { approvedTotalPaisa },
    });
    return result;
  });

  await transitionBooking({
    bookingId: quote.booking.id,
    to: 'QUOTE_APPROVED',
    actorRole: 'CUSTOMER',
    actorUserId: params.customerUserId,
    reason: 'Quote approved by customer',
    metadata: { quoteId: quote.id, approvedTotalPaisa, wasAdditional: quote.isAdditional },
  });

  // Where the job was when the quote interrupted it decides where it resumes.
  // A technician who was already on site or working carries on; an initial
  // quote leaves the booking at QUOTE_APPROVED awaiting schedule confirmation.
  const interruptedAt = await interruptedFrom(quote.booking.id);
  if (interruptedAt === 'IN_PROGRESS' || interruptedAt === 'ARRIVED') {
    await transitionBooking({
      bookingId: quote.booking.id,
      to: 'IN_PROGRESS',
      actorRole: 'SYSTEM',
      reason: 'Resuming work after charges approved',
    });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.QUOTE_DECIDED,
    entity: 'Quote',
    entityId: quote.id,
    actorUserId: params.customerUserId,
    actorRole: 'CUSTOMER',
    metadata: { decision: 'APPROVED', approvedTotalPaisa },
  });

  await notify({
    event: NOTIFICATION_EVENTS.QUOTE_APPROVED,
    userId: quote.provider.userId,
    title: 'Quote approved',
    body: `${quote.booking.reference}: the customer approved your ${formatPaisa(approvedTotalPaisa)} quote.`,
    href: `/provider/jobs/${quote.booking.id}`,
    data: { bookingId: quote.booking.id, quoteId: quote.id },
  });

  return { quote: updated, approvedTotalPaisa };
}

/** Customer rejects a quote; the provider may submit a revised one. */
export async function rejectQuote(params: {
  quoteId: string;
  customerUserId: string;
  reason?: string;
}): Promise<Quote> {
  const quote = await prisma.quote.findUnique({
    where: { id: params.quoteId },
    include: {
      booking: {
        select: { id: true, customerId: true, reference: true, approvedTotalPaisa: true },
      },
      provider: { select: { userId: true } },
    },
  });
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found.');
  if (quote.booking.customerId !== params.customerUserId) {
    throw new AppError('FORBIDDEN', 'This quote does not belong to your booking.');
  }
  if (quote.status !== 'SUBMITTED') {
    throw new AppError('QUOTE_NOT_PENDING', 'This quote can no longer be declined.');
  }

  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: 'REJECTED',
      respondedAt: new Date(),
      rejectionReason: params.reason?.trim() || null,
    },
    include: { items: true },
  });

  // A rejected *initial* quote goes back to ACCEPTED so the provider can
  // re-quote — there is no agreed price yet. A rejected *additional* quote
  // leaves the agreed price untouched (that is the whole point of requiring a
  // separate approval) and returns the job to where the quote interrupted it,
  // so declining an optional upgrade does not un-schedule the visit or send a
  // technician who is already on site back to the start.
  const resumeAt = quote.isAdditional ? await interruptedFrom(quote.booking.id) : null;
  const nextStatus: BookingStatus =
    resumeAt && RESUMABLE_AFTER_QUOTE.includes(resumeAt) ? resumeAt : 'ACCEPTED';

  await transitionBooking({
    bookingId: quote.booking.id,
    to: nextStatus,
    // The customer rejected the quote; putting the job back where it was is the
    // platform's own bookkeeping, not a customer action, so it is recorded as
    // such — and these resume transitions are SYSTEM-only in the state machine
    // precisely so they never surface as buttons.
    actorRole: nextStatus === 'ACCEPTED' ? 'CUSTOMER' : 'SYSTEM',
    actorUserId: params.customerUserId,
    reason: params.reason ?? 'Quote rejected by customer',
    metadata: { quoteId: quote.id, wasAdditional: quote.isAdditional },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.QUOTE_DECIDED,
    entity: 'Quote',
    entityId: quote.id,
    actorUserId: params.customerUserId,
    actorRole: 'CUSTOMER',
    metadata: { decision: 'REJECTED', reason: params.reason ?? null },
  });

  await notify({
    event: NOTIFICATION_EVENTS.QUOTE_REJECTED,
    userId: quote.provider.userId,
    title: 'Quote declined',
    body: `${quote.booking.reference}: the customer declined the quote.${
      params.reason ? ` Reason: ${params.reason}` : ' You can send a revised quote.'
    }`,
    href: `/provider/jobs/${quote.booking.id}`,
    data: { bookingId: quote.booking.id, quoteId: quote.id },
  });

  return updated;
}

/**
 * Complete a job. Refuses without an approved price, and refuses while any
 * additional charge is still awaiting the customer's decision — that is what
 * stops a bill growing after the fact.
 */
export async function completeBooking(params: {
  bookingId: string;
  providerId: string;
  actorUserId: string;
  completionNotes?: string;
}): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: {
      service: { select: { name: true } },
      quotes: { where: { status: 'SUBMITTED' }, select: { id: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  if (booking.providerId !== params.providerId) {
    throw new AppError('FORBIDDEN', 'This booking is not assigned to you.');
  }
  if (booking.quotes.length > 0) {
    throw new AppError(
      'QUOTE_NOT_PENDING',
      'Let the customer decide the pending charges first, then complete the job.',
    );
  }
  if (booking.approvedTotalPaisa === null) {
    throw new AppError(
      'QUOTE_REQUIRED',
      'A customer-approved quote is required before a job can be completed.',
    );
  }

  const result = await transitionBooking({
    bookingId: booking.id,
    to: 'COMPLETED',
    actorRole: 'PROVIDER',
    actorUserId: params.actorUserId,
    reason: 'Job completed by provider',
    patch: params.completionNotes ? { providerNotes: params.completionNotes.trim() } : undefined,
  });

  const guaranteeDays = result.booking.guaranteeDays;
  await notify({
    event: NOTIFICATION_EVENTS.JOB_COMPLETED,
    userId: booking.customerId,
    title: 'Job completed',
    body: `${booking.service.name} complete. Total: ${formatPaisa(result.booking.finalTotalPaisa ?? 0)}.${
      guaranteeDays > 0 ? ` A ${guaranteeDays}-day service guarantee applies.` : ''
    } Record the payment and leave a review.`,
    href: `/account/bookings/${booking.id}`,
    data: { bookingId: booking.id },
  });

  await notify({
    event: NOTIFICATION_EVENTS.REVIEW_REQUESTED,
    userId: booking.customerId,
    title: 'Tell us how it went',
    body: 'Your rating helps other customers choose the right technician.',
    href: `/account/bookings/${booking.id}?review=1`,
    data: { bookingId: booking.id },
  });
}

/** The quote a customer is currently being asked to decide on. */
export async function pendingQuoteFor(bookingId: string) {
  return prisma.quote.findFirst({
    where: { bookingId, status: 'SUBMITTED' },
    include: { items: { orderBy: { createdAt: 'asc' } } },
    orderBy: { submittedAt: 'desc' },
  });
}

/** Every quote on a booking, newest first — the negotiation history. */
export async function quoteHistoryFor(bookingId: string) {
  return prisma.quote.findMany({
    where: { bookingId },
    include: { items: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Human-readable label for a quote line kind. */
export const QUOTE_ITEM_LABELS: Record<QuoteItemKind, string> = {
  INSPECTION: 'Inspection',
  LABOUR: 'Labour',
  PARTS: 'Parts',
  EMERGENCY_FEE: 'Emergency fee',
  TRAVEL: 'Travel',
  OTHER: 'Other',
};

/** Whether the platform requires an inspection-first flow for this service. */
export async function quoteRequiredFor(serviceId: string): Promise<boolean> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { requiresInspection: true },
  });
  return service?.requiresInspection ?? true;
}

/** Guarantee window still open on a completed booking? */
export async function guaranteeActive(bookingId: string): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { guaranteeEligible: true, guaranteeExpiresAt: true, status: true },
  });
  if (!booking?.guaranteeEligible || !booking.guaranteeExpiresAt) return false;
  const enabled = await getSetting('guarantee.enabled');
  return enabled && booking.guaranteeExpiresAt > new Date();
}
