import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATUSES,
  assertTransition,
  availableTransitions,
  canTransition,
  humanStatus,
  TERMINAL_STATUSES,
  trackerIndex,
  TRANSITIONS,
} from '@/lib/bookings/state-machine';
import { AppError } from '@/lib/errors';

/**
 * Booking state machine.
 *
 * The transition table is the contract every other module relies on, so these
 * tests pin down both what is allowed and — more importantly — what is not.
 */
describe('booking state machine', () => {
  it('walks the happy path from the brief', () => {
    expect(canTransition('PENDING', 'PROVIDER_NOTIFIED', 'SYSTEM')).toBe(true);
    expect(canTransition('PROVIDER_NOTIFIED', 'ACCEPTED', 'PROVIDER')).toBe(true);
    expect(canTransition('ACCEPTED', 'QUOTE_PENDING', 'PROVIDER')).toBe(true);
    expect(canTransition('QUOTE_PENDING', 'QUOTE_APPROVED', 'CUSTOMER')).toBe(true);
    expect(canTransition('QUOTE_APPROVED', 'SCHEDULED', 'PROVIDER')).toBe(true);
    expect(canTransition('SCHEDULED', 'ON_THE_WAY', 'PROVIDER')).toBe(true);
    expect(canTransition('ON_THE_WAY', 'ARRIVED', 'PROVIDER')).toBe(true);
    expect(canTransition('ARRIVED', 'IN_PROGRESS', 'PROVIDER')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED', 'PROVIDER')).toBe(true);
  });

  it('refuses to skip stages', () => {
    expect(canTransition('PENDING', 'COMPLETED', 'PROVIDER')).toBe(false);
    expect(canTransition('ACCEPTED', 'IN_PROGRESS', 'PROVIDER')).toBe(false);
    expect(canTransition('SCHEDULED', 'COMPLETED', 'PROVIDER')).toBe(false);
    expect(canTransition('PENDING', 'IN_PROGRESS', 'ADMIN')).toBe(false);
  });

  it('never moves backwards through the working stages', () => {
    expect(canTransition('COMPLETED', 'IN_PROGRESS', 'ADMIN')).toBe(false);
    expect(canTransition('ARRIVED', 'ON_THE_WAY', 'PROVIDER')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'ARRIVED', 'PROVIDER')).toBe(false);
  });

  it('enforces who may make each move', () => {
    // A customer cannot mark the technician as arrived.
    expect(canTransition('SCHEDULED', 'ARRIVED', 'CUSTOMER')).toBe(false);
    expect(canTransition('SCHEDULED', 'ARRIVED', 'PROVIDER')).toBe(true);
    // A provider cannot approve their own quote.
    expect(canTransition('QUOTE_PENDING', 'QUOTE_APPROVED', 'PROVIDER')).toBe(false);
    expect(canTransition('QUOTE_PENDING', 'QUOTE_APPROVED', 'CUSTOMER')).toBe(true);
    // Only staff may refund.
    expect(canTransition('COMPLETED', 'REFUNDED', 'PROVIDER')).toBe(false);
    expect(canTransition('COMPLETED', 'REFUNDED', 'CUSTOMER')).toBe(false);
    expect(canTransition('COMPLETED', 'REFUNDED', 'ADMIN')).toBe(true);
  });

  it('treats cancelled and refunded as terminal', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it('allows a rejected quote to return to ACCEPTED for a re-quote', () => {
    expect(canTransition('QUOTE_PENDING', 'ACCEPTED', 'CUSTOMER')).toBe(true);
  });

  it('lets an on-site technician resume after extra charges are approved', () => {
    // Mid-job additional charges: IN_PROGRESS -> QUOTE_PENDING -> QUOTE_APPROVED
    // -> IN_PROGRESS, without re-walking the travel steps.
    expect(canTransition('IN_PROGRESS', 'QUOTE_PENDING', 'PROVIDER')).toBe(true);
    expect(canTransition('QUOTE_APPROVED', 'IN_PROGRESS', 'SYSTEM')).toBe(true);
  });

  it('throws a typed error with a readable message', () => {
    expect(() => assertTransition('PENDING', 'COMPLETED', 'PROVIDER')).toThrow(AppError);
    try {
      assertTransition('PENDING', 'COMPLETED', 'PROVIDER');
    } catch (error) {
      expect((error as AppError).code).toBe('INVALID_STATUS_TRANSITION');
      expect((error as AppError).message).toContain(humanStatus('PENDING'));
    }
  });

  it('distinguishes a forbidden actor from an impossible transition', () => {
    // The move exists but this actor may not make it -> FORBIDDEN.
    try {
      assertTransition('QUOTE_PENDING', 'QUOTE_APPROVED', 'PROVIDER');
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
    // The move does not exist at all -> INVALID_STATUS_TRANSITION.
    try {
      assertTransition('PENDING', 'ARRIVED', 'PROVIDER');
    } catch (error) {
      expect((error as AppError).code).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  it('rejects a no-op transition', () => {
    expect(() => assertTransition('ACCEPTED', 'ACCEPTED', 'PROVIDER')).toThrow(AppError);
  });

  it('offers only actor-appropriate actions for the UI', () => {
    const providerActions = availableTransitions('SCHEDULED', 'PROVIDER').map((rule) => rule.to);
    expect(providerActions).toContain('ON_THE_WAY');
    expect(providerActions).toContain('ARRIVED');

    const customerActions = availableTransitions('SCHEDULED', 'CUSTOMER').map((rule) => rule.to);
    expect(customerActions).toEqual(['CANCELLED']);
  });

  it('maps every status to a tracker position', () => {
    expect(trackerIndex('PENDING')).toBe(0);
    expect(trackerIndex('PROVIDER_NOTIFIED')).toBe(0);
    expect(trackerIndex('QUOTE_PENDING')).toBe(1);
    expect(trackerIndex('COMPLETED')).toBe(6);
  });

  it('excludes terminal statuses from the active set', () => {
    expect(ACTIVE_STATUSES).not.toContain('COMPLETED');
    expect(ACTIVE_STATUSES).not.toContain('CANCELLED');
    expect(ACTIVE_STATUSES).toContain('IN_PROGRESS');
  });
});
