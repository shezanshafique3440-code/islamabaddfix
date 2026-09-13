import type { BookingStatus, Role } from '@prisma/client';
import { AppError } from '../errors';

/**
 * Booking lifecycle.
 *
 * The transition table is the single source of truth: which statuses may
 * follow, and which actor is allowed to make the move. Nothing in the codebase
 * writes Booking.status directly — everything goes through
 * `transitionBooking` in ./transition.ts, which consults this table and writes
 * a BookingStatusHistory row in the same transaction.
 */

export type Actor = 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SYSTEM';

export interface TransitionRule {
  to: BookingStatus;
  /** Who may perform this transition. */
  actors: readonly Actor[];
  /** Short label used in the UI for the button that performs it. */
  label: string;
}

/**
 * Terminal statuses. A booking in one of these never moves again, except
 * COMPLETED -> DISPUTED (a dispute may be raised after the fact) and
 * DISPUTED -> REFUNDED/COMPLETED (admin resolution).
 */
export const TERMINAL_STATUSES: readonly BookingStatus[] = ['CANCELLED', 'REFUNDED'];

export const TRANSITIONS: Record<BookingStatus, readonly TransitionRule[]> = {
  PENDING: [
    { to: 'PROVIDER_NOTIFIED', actors: ['SYSTEM', 'ADMIN'], label: 'Notify providers' },
    // Direct assignment when the customer picked a specific provider.
    { to: 'ACCEPTED', actors: ['PROVIDER', 'ADMIN'], label: 'Accept' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], label: 'Cancel' },
  ],
  PROVIDER_NOTIFIED: [
    { to: 'ACCEPTED', actors: ['PROVIDER', 'ADMIN'], label: 'Accept' },
    // Re-fan-out to the next tranche of providers after declines/expiry.
    { to: 'PENDING', actors: ['SYSTEM', 'ADMIN'], label: 'Re-queue' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], label: 'Cancel' },
  ],
  ACCEPTED: [
    {
      to: 'QUOTE_PENDING',
      actors: ['PROVIDER'],
      label: 'Submit quote',
    },
    // Services with a fixed published price skip quoting entirely.
    {
      to: 'SCHEDULED',
      actors: ['PROVIDER', 'ADMIN'],
      label: 'Confirm schedule',
    },
    {
      to: 'CANCELLED',
      actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'],
      label: 'Cancel',
    },
  ],
  QUOTE_PENDING: [
    // 'SYSTEM' is on this rule as well as 'CUSTOMER' because a *rejected*
    // additional quote also lands here: the agreed price still stands, so the
    // job goes back to QUOTE_APPROVED even though nobody approved anything new.
    {
      to: 'QUOTE_APPROVED',
      actors: ['CUSTOMER', 'SYSTEM'],
      label: 'Approve quote',
    },
    // Rejecting an *initial* quote returns the job to ACCEPTED so the provider
    // may re-quote — there is no agreed price to protect.
    { to: 'ACCEPTED', actors: ['CUSTOMER'], label: 'Reject quote' },
    // Resume points for a decided *additional* quote. A quote interrupts the job
    // wherever it was, and the decision has to put it back there: a technician
    // standing in the customer's kitchen when the extra part was declined is
    // still standing there. SYSTEM-only, so these never render as buttons —
    // `rejectQuote` performs them from the recorded interruption point.
    { to: 'SCHEDULED', actors: ['SYSTEM'], label: 'Resume schedule' },
    { to: 'ARRIVED', actors: ['SYSTEM'], label: 'Resume on site' },
    {
      to: 'IN_PROGRESS',
      actors: ['PROVIDER', 'SYSTEM'],
      label: 'Resume job',
    },
    {
      to: 'CANCELLED',
      actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'],
      label: 'Cancel',
    },
  ],
  QUOTE_APPROVED: [
    {
      to: 'SCHEDULED',
      actors: ['PROVIDER', 'ADMIN', 'SYSTEM'],
      label: 'Confirm schedule',
    },
    // A technician already on site whose (revised or additional) quote was just
    // approved resumes work directly rather than re-walking the travel steps.
    {
      to: 'IN_PROGRESS',
      actors: ['PROVIDER', 'SYSTEM'],
      label: 'Resume job',
    },
    // Extra cost found after the price was agreed but before setting off. It
    // needs its own approval, exactly like one found mid-job.
    {
      to: 'QUOTE_PENDING',
      actors: ['PROVIDER'],
      label: 'Request extra charges',
    },
    {
      to: 'CANCELLED',
      actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'],
      label: 'Cancel',
    },
  ],
  SCHEDULED: [
    { to: 'ON_THE_WAY', actors: ['PROVIDER'], label: 'On the way' },
    // A technician already on site can start without the travel step.
    { to: 'ARRIVED', actors: ['PROVIDER'], label: 'Arrived' },
    {
      to: 'QUOTE_PENDING',
      actors: ['PROVIDER'],
      label: 'Request extra charges',
    },
    {
      to: 'CANCELLED',
      actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'],
      label: 'Cancel',
    },
  ],
  ON_THE_WAY: [
    { to: 'ARRIVED', actors: ['PROVIDER'], label: 'Arrived' },
    {
      to: 'CANCELLED',
      actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'],
      label: 'Cancel',
    },
  ],
  ARRIVED: [
    { to: 'IN_PROGRESS', actors: ['PROVIDER'], label: 'Start job' },
    // On-site inspection often reveals the real scope — allow a fresh quote.
    {
      to: 'QUOTE_PENDING',
      actors: ['PROVIDER'],
      label: 'Revise quote',
    },
    {
      to: 'CANCELLED',
      actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'],
      label: 'Cancel',
    },
  ],
  IN_PROGRESS: [
    {
      to: 'COMPLETED',
      actors: ['PROVIDER'],
      label: 'Complete job',
    },
    // Additional charges discovered mid-job need customer approval first.
    {
      to: 'QUOTE_PENDING',
      actors: ['PROVIDER'],
      label: 'Request extra charges',
    },
    { to: 'CANCELLED', actors: ['ADMIN'], label: 'Cancel' },
  ],
  COMPLETED: [
    {
      to: 'DISPUTED',
      actors: ['CUSTOMER', 'ADMIN'],
      label: 'Raise dispute',
    },
    { to: 'REFUNDED', actors: ['ADMIN'], label: 'Refund' },
  ],
  DISPUTED: [
    { to: 'COMPLETED', actors: ['ADMIN'], label: 'Close dispute' },
    { to: 'REFUNDED', actors: ['ADMIN'], label: 'Refund' },
    { to: 'CANCELLED', actors: ['ADMIN'], label: 'Cancel booking' },
  ],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses in which the provider still owes the customer work. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  'PENDING',
  'PROVIDER_NOTIFIED',
  'ACCEPTED',
  'QUOTE_PENDING',
  'QUOTE_APPROVED',
  'SCHEDULED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
];

/** Statuses that count against a provider's concurrent workload. */
export const WORKLOAD_STATUSES: readonly BookingStatus[] = [
  'ACCEPTED',
  'QUOTE_PENDING',
  'QUOTE_APPROVED',
  'SCHEDULED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
];

export function actorForRole(role: Role): Actor {
  switch (role) {
    case 'CUSTOMER':
      return 'CUSTOMER';
    case 'PROVIDER':
      return 'PROVIDER';
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return 'ADMIN';
    default:
      return 'SYSTEM';
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  return TRANSITIONS[from].some((rule) => rule.to === to && rule.actors.includes(actor));
}

/** Transitions available to this actor right now — drives the action buttons. */
export function availableTransitions(from: BookingStatus, actor: Actor): TransitionRule[] {
  return TRANSITIONS[from].filter((rule) => rule.actors.includes(actor));
}

export function assertTransition(from: BookingStatus, to: BookingStatus, actor: Actor): void {
  if (from === to) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `The booking is already in the "${humanStatus(to)}" status.`,
      { context: { from, to, actor } },
    );
  }
  if (!TRANSITIONS[from].some((rule) => rule.to === to)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `Moving from "${humanStatus(from)}" to "${humanStatus(to)}" is not allowed.`,
      { context: { from, to, actor } },
    );
  }
  if (!canTransition(from, to, actor)) {
    throw new AppError('FORBIDDEN', 'You cannot make this status change.', {
      context: { from, to, actor },
    });
  }
}

/** What each status is called in the interface. */
const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  PROVIDER_NOTIFIED: 'Technicians notified',
  ACCEPTED: 'Accepted',
  QUOTE_PENDING: 'Quote sent',
  QUOTE_APPROVED: 'Quote approved',
  SCHEDULED: 'Scheduled',
  ON_THE_WAY: 'On the way',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
  REFUNDED: 'Refunded',
};

export const humanStatus = (status: BookingStatus): string => STATUS_LABELS[status];

/** Progress step (1-based) for the customer-facing tracker. */
export const TRACKER_STEPS: readonly BookingStatus[] = [
  'PENDING',
  'ACCEPTED',
  'SCHEDULED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
];

export function trackerIndex(status: BookingStatus): number {
  switch (status) {
    case 'PROVIDER_NOTIFIED':
      return 0;
    case 'QUOTE_PENDING':
    case 'QUOTE_APPROVED':
      return 1;
    default: {
      const index = TRACKER_STEPS.indexOf(status);
      return index === -1 ? 0 : index;
    }
  }
}
