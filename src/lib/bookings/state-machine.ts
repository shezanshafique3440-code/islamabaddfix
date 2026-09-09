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
  /** Roman Urdu label shown to the actor. */
  labelUr?: string;
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
    { to: 'ACCEPTED', actors: ['PROVIDER', 'ADMIN'], label: 'Accept', labelUr: 'Qubool karein' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  PROVIDER_NOTIFIED: [
    { to: 'ACCEPTED', actors: ['PROVIDER', 'ADMIN'], label: 'Accept', labelUr: 'Qubool karein' },
    // Re-fan-out to the next tranche of providers after declines/expiry.
    { to: 'PENDING', actors: ['SYSTEM', 'ADMIN'], label: 'Re-queue' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  ACCEPTED: [
    {
      to: 'QUOTE_PENDING',
      actors: ['PROVIDER'],
      label: 'Submit quote',
      labelUr: 'Quote bhejein',
    },
    // Services with a fixed published price skip quoting entirely.
    { to: 'SCHEDULED', actors: ['PROVIDER', 'ADMIN'], label: 'Confirm schedule', labelUr: 'Time confirm karein' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  QUOTE_PENDING: [
    { to: 'QUOTE_APPROVED', actors: ['CUSTOMER'], label: 'Approve quote', labelUr: 'Quote approve karein' },
    // Rejection returns the job to ACCEPTED so the provider may re-quote.
    { to: 'ACCEPTED', actors: ['CUSTOMER'], label: 'Reject quote', labelUr: 'Quote reject karein' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  QUOTE_APPROVED: [
    { to: 'SCHEDULED', actors: ['PROVIDER', 'ADMIN', 'SYSTEM'], label: 'Confirm schedule', labelUr: 'Time confirm karein' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  SCHEDULED: [
    { to: 'ON_THE_WAY', actors: ['PROVIDER'], label: 'On the way', labelUr: 'Raste mein hoon' },
    // A technician already on site can start without the travel step.
    { to: 'ARRIVED', actors: ['PROVIDER'], label: 'Arrived', labelUr: 'Pohonch gaya' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  ON_THE_WAY: [
    { to: 'ARRIVED', actors: ['PROVIDER'], label: 'Arrived', labelUr: 'Pohonch gaya' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  ARRIVED: [
    { to: 'IN_PROGRESS', actors: ['PROVIDER'], label: 'Start job', labelUr: 'Kaam shuru karein' },
    // On-site inspection often reveals the real scope — allow a fresh quote.
    { to: 'QUOTE_PENDING', actors: ['PROVIDER'], label: 'Revise quote', labelUr: 'Quote update karein' },
    { to: 'CANCELLED', actors: ['CUSTOMER', 'PROVIDER', 'ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  IN_PROGRESS: [
    { to: 'COMPLETED', actors: ['PROVIDER'], label: 'Complete job', labelUr: 'Kaam complete karein' },
    // Additional charges discovered mid-job need customer approval first.
    { to: 'QUOTE_PENDING', actors: ['PROVIDER'], label: 'Request extra charges', labelUr: 'Extra charges' },
    { to: 'CANCELLED', actors: ['ADMIN'], label: 'Cancel', labelUr: 'Cancel karein' },
  ],
  COMPLETED: [
    { to: 'DISPUTED', actors: ['CUSTOMER', 'ADMIN'], label: 'Raise dispute', labelUr: 'Shikayat darj karein' },
    { to: 'REFUNDED', actors: ['ADMIN'], label: 'Refund', labelUr: 'Refund karein' },
  ],
  DISPUTED: [
    { to: 'COMPLETED', actors: ['ADMIN'], label: 'Close dispute', labelUr: 'Dispute band karein' },
    { to: 'REFUNDED', actors: ['ADMIN'], label: 'Refund', labelUr: 'Refund karein' },
    { to: 'CANCELLED', actors: ['ADMIN'], label: 'Cancel booking', labelUr: 'Booking cancel' },
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
      `Booking pehle se "${humanStatus(to)}" status mein hai.`,
      { context: { from, to, actor } },
    );
  }
  if (!TRANSITIONS[from].some((rule) => rule.to === to)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `"${humanStatus(from)}" se "${humanStatus(to)}" tak jana allowed nahi hai.`,
      { context: { from, to, actor } },
    );
  }
  if (!canTransition(from, to, actor)) {
    throw new AppError('FORBIDDEN', 'Yeh status change aap nahi kar sakte.', {
      context: { from, to, actor },
    });
  }
}

const STATUS_LABELS: Record<BookingStatus, { en: string; ur: string }> = {
  PENDING: { en: 'Pending', ur: 'Intezar mein' },
  PROVIDER_NOTIFIED: { en: 'Provider notified', ur: 'Technicians ko bheja gaya' },
  ACCEPTED: { en: 'Accepted', ur: 'Qubool ho gaya' },
  QUOTE_PENDING: { en: 'Quote sent', ur: 'Quote aa gaya' },
  QUOTE_APPROVED: { en: 'Quote approved', ur: 'Quote approve ho gaya' },
  SCHEDULED: { en: 'Scheduled', ur: 'Time confirm hai' },
  ON_THE_WAY: { en: 'On the way', ur: 'Technician raste mein hai' },
  ARRIVED: { en: 'Arrived', ur: 'Technician pohonch gaya' },
  IN_PROGRESS: { en: 'In progress', ur: 'Kaam chal raha hai' },
  COMPLETED: { en: 'Completed', ur: 'Kaam complete ho gaya' },
  CANCELLED: { en: 'Cancelled', ur: 'Cancel ho gaya' },
  DISPUTED: { en: 'Disputed', ur: 'Shikayat darj hai' },
  REFUNDED: { en: 'Refunded', ur: 'Refund ho gaya' },
};

export const humanStatus = (status: BookingStatus): string => STATUS_LABELS[status].en;
export const humanStatusUr = (status: BookingStatus): string => STATUS_LABELS[status].ur;

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
