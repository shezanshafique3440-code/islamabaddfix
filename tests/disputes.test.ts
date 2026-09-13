import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/lib/errors';
import {
  decideGuaranteeClaim,
  openDispute,
  resolveDispute,
  submitGuaranteeClaim,
} from '@/lib/bookings/disputes';
import { initiatePayment, settlePayment } from '@/lib/payments';
import {
  createAddress,
  createProvider,
  createService,
  createUser,
  createZone,
  db,
  setSettingValue,
} from './helpers';
import { truncateAll } from './setup';

/**
 * Disputes and guarantee claims.
 *
 * These are the paths a customer reaches when something has already gone wrong,
 * so the promises must hold exactly:
 *  - only the booking's own customer can escalate, and only staff can decide;
 *  - a refund outcome moves real money through the payment record, so a dispute
 *    can never be marked "refunded" without a refund existing;
 *  - guarantee eligibility is read from what was frozen onto the booking at
 *    completion, never re-decided afterwards in either direction.
 */

async function completedBooking(options: { guarantee?: boolean; days?: number } = {}) {
  const service = await createService();
  const zone = await createZone();
  const customer = await createUser({ role: 'CUSTOMER' });
  const stranger = await createUser({ role: 'CUSTOMER' });
  const admin = await createUser({ role: 'ADMIN' });
  const { provider, user: providerUser } = await createProvider({
    serviceIds: [service.id],
    zoneIds: [zone.id],
  });
  const address = await createAddress(customer.id, zone.id);

  const guaranteeEligible = options.guarantee ?? true;
  const days = options.days ?? 7;
  const booking = await db.booking.create({
    data: {
      reference: `IFX-C-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      providerId: provider.id,
      status: 'COMPLETED',
      problemDescription: 'AC not cooling',
      approvedTotalPaisa: 330_000,
      finalTotalPaisa: 330_000,
      commissionPaisa: 33_000,
      providerEarningsPaisa: 297_000,
      completedAt: new Date(),
      guaranteeEligible,
      guaranteeDays: days,
      guaranteeExpiresAt: guaranteeEligible
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        : null,
    },
  });

  return { service, zone, customer, stranger, admin, provider, providerUser, address, booking };
}

async function payCash(bookingId: string, actorUserId: string) {
  const { payment } = await initiatePayment({
    bookingId,
    method: 'CASH',
    actorUserId,
  });
  return settlePayment({ paymentId: payment.id, actorUserId, actorRole: 'ADMIN' });
}

describe('opening a dispute', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('moves a completed booking to DISPUTED and opens a thread', async () => {
    const { customer, booking } = await completedBooking();

    const dispute = await openDispute({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      reason: 'POOR_SERVICE',
      description: 'Cooling stopped again the same evening',
    });

    expect(dispute.status).toBe('OPEN');
    expect(dispute.reference).toMatch(/\w/);

    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.status).toBe('DISPUTED');

    const conversation = await db.conversation.findFirstOrThrow({
      where: { disputeId: dispute.id },
    });
    expect(conversation.kind).toBe('DISPUTE');
  });

  it('refuses a dispute raised by anybody but the booking customer', async () => {
    const { stranger, providerUser, booking } = await completedBooking();

    for (const userId of [stranger.id, providerUser.id]) {
      await expect(
        openDispute({
          bookingId: booking.id,
          raisedByUserId: userId,
          reason: 'POOR_SERVICE',
          description: 'Not my booking',
        }),
      ).rejects.toThrow(/only the customer on this booking/i);
    }

    expect(await db.dispute.count()).toBe(0);
  });

  it('refuses a second open dispute on the same booking', async () => {
    const { customer, booking } = await completedBooking();
    await openDispute({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      reason: 'WRONG_PRICE',
      description: 'Charged more than the quote',
    });

    await expect(
      openDispute({
        bookingId: booking.id,
        raisedByUserId: customer.id,
        reason: 'DAMAGE',
        description: 'And they scratched the wall',
      }),
    ).rejects.toThrow(/already an open dispute/i);
  });

  it('allows a fresh dispute once the previous one is closed', async () => {
    const { customer, admin, booking } = await completedBooking();
    const first = await openDispute({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      reason: 'WRONG_PRICE',
      description: 'Charged more than the quote',
    });
    await resolveDispute({
      disputeId: first.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_NO_ACTION',
      notes: 'Quote and invoice matched',
    });

    const second = await openDispute({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      reason: 'DAMAGE',
      description: 'A separate problem entirely',
    });
    expect(second.status).toBe('OPEN');
  });

  it('leaves an unfinished job in its own status so the work can still be done', async () => {
    const { customer, booking } = await completedBooking();
    await db.booking.update({ where: { id: booking.id }, data: { status: 'IN_PROGRESS' } });

    await openDispute({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      reason: 'TECHNICIAN_NO_SHOW',
      description: 'Nobody turned up at the agreed time',
    });

    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.status).toBe('IN_PROGRESS');
  });

  it('attaches only the raiser own unattached evidence', async () => {
    const { customer, stranger, booking } = await completedBooking();
    const mine = await db.uploadedFile.create({
      data: {
        storageKey: 'd1',
        driver: 'local',
        purpose: 'DISPUTE_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        originalName: 'mine.jpg',
        checksumSha256: 'a'.repeat(64),
        ownerId: customer.id,
      },
    });
    const theirs = await db.uploadedFile.create({
      data: {
        storageKey: 'd2',
        driver: 'local',
        purpose: 'DISPUTE_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        originalName: 'theirs.jpg',
        checksumSha256: 'b'.repeat(64),
        ownerId: stranger.id,
      },
    });

    const dispute = await openDispute({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      reason: 'DAMAGE',
      description: 'Photos attached',
      fileIds: [mine.id, theirs.id],
    });

    const attached = await db.uploadedFile.findMany({ where: { disputeId: dispute.id } });
    // Passing somebody else's file id must not pull their photo into your case.
    expect(attached.map((file) => file.id)).toEqual([mine.id]);
  });
});

describe('resolving a dispute', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  async function openOne() {
    const fixture = await completedBooking();
    const dispute = await openDispute({
      bookingId: fixture.booking.id,
      raisedByUserId: fixture.customer.id,
      reason: 'POOR_SERVICE',
      description: 'Work was not finished properly',
    });
    return { ...fixture, dispute };
  }

  it('records an interim status without closing anything', async () => {
    const { admin, dispute, booking } = await openOne();

    const { dispute: updated } = await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'UNDER_REVIEW',
      notes: 'Asked the technician for their account',
    });

    expect(updated.status).toBe('UNDER_REVIEW');
    expect(updated.resolvedAt).toBeNull();
    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // Still disputed: an interim note is not a decision.
    expect(saved.status).toBe('DISPUTED');
  });

  it('refuses to mark a refund when no payment was ever taken', async () => {
    const { admin, dispute } = await openOne();

    const failure = await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_REFUND',
      notes: 'Customer asked for their money back',
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('CONFLICT');
    const saved = await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    // The dispute is untouched — no phantom "refunded" state.
    expect(saved.status).toBe('OPEN');
    expect(saved.refundPaisa).toBe(0);
  });

  it('refunds the whole payment and moves the booking to REFUNDED', async () => {
    const { admin, customer, dispute, booking } = await openOne();
    await payCash(booking.id, customer.id);

    const { dispute: resolved } = await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_REFUND',
      notes: 'Job had to be redone by somebody else',
    });

    expect(resolved.status).toBe('RESOLVED_REFUND');
    expect(resolved.refundPaisa).toBe(330_000);
    expect(resolved.resolvedByUserId).toBe(admin.id);
    expect(resolved.resolvedAt).not.toBeNull();

    const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.refundedPaisa).toBe(330_000);
    expect(payment.status).toBe('REFUNDED');

    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.status).toBe('REFUNDED');
  });

  it('refunds only the agreed part on a partial decision', async () => {
    const { admin, customer, dispute, booking } = await openOne();
    await payCash(booking.id, customer.id);

    const { dispute: resolved } = await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_PARTIAL_REFUND',
      refundPaisa: 100_000,
      notes: 'Half the work was usable',
    });

    expect(resolved.refundPaisa).toBe(100_000);
    const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.refundedPaisa).toBe(100_000);
    expect(payment.status).toBe('PARTIALLY_REFUNDED');

    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // A partial refund is not a full one: the job stays completed.
    expect(saved.status).toBe('COMPLETED');
  });

  it('refuses a partial refund with no amount, and one beyond the balance', async () => {
    const { admin, customer, dispute, booking } = await openOne();
    await payCash(booking.id, customer.id);

    await expect(
      resolveDispute({
        disputeId: dispute.id,
        actorUserId: admin.id,
        actorRole: 'ADMIN',
        status: 'RESOLVED_PARTIAL_REFUND',
      }),
    ).rejects.toThrow(/valid amount/i);

    await expect(
      resolveDispute({
        disputeId: dispute.id,
        actorUserId: admin.id,
        actorRole: 'ADMIN',
        status: 'RESOLVED_PARTIAL_REFUND',
        refundPaisa: 900_000,
      }),
    ).rejects.toThrow(/available balance/i);

    const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.refundedPaisa).toBe(0);
  });

  it('closes without a refund when the complaint does not stand up', async () => {
    const { admin, customer, dispute, booking } = await openOne();
    await payCash(booking.id, customer.id);

    const { dispute: resolved } = await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_NO_ACTION',
      notes: 'Photos show the work was completed as quoted',
    });

    expect(resolved.refundPaisa).toBe(0);
    const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.status).toBe('PAID');
    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.status).toBe('COMPLETED');
  });

  it('writes every decision to the audit log with its actor', async () => {
    const { admin, dispute } = await openOne();
    await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_NO_ACTION',
      notes: 'No fault found',
    });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: 'Dispute', entityId: dispute.id },
    });
    expect(entry.actorUserId).toBe(admin.id);
    expect(entry.actorRole).toBe('ADMIN');
  });

  it('tells both the customer and the provider what was decided', async () => {
    const { admin, customer, providerUser, dispute } = await openOne();
    await resolveDispute({
      disputeId: dispute.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'RESOLVED_NO_ACTION',
    });

    for (const userId of [customer.id, providerUser.id]) {
      const count = await db.notification.count({
        where: { userId, event: 'dispute.update' },
      });
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe('guarantee claims', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('guarantee.enabled', true);
    await setSettingValue('guarantee.providerResponsibleByDefault', true);
  });

  it('accepts a claim inside the window on an eligible booking', async () => {
    const { customer, booking } = await completedBooking({ guarantee: true, days: 7 });

    const claim = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'The same fault came back after four days',
    });

    expect(claim.status).toBe('SUBMITTED');
    expect(claim.bookingId).toBe(booking.id);
  });

  it('refuses a claim on a booking the guarantee never covered', async () => {
    const { customer, booking } = await completedBooking({ guarantee: false });

    const failure = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Please send somebody again',
    }).catch((error: AppError) => error);

    // Not every job is covered, and the product must not pretend otherwise.
    expect((failure as AppError).code).toBe('GUARANTEE_NOT_ELIGIBLE');
  });

  it('refuses a claim after the frozen window has passed', async () => {
    const { customer, booking } = await completedBooking({ guarantee: true, days: 7 });
    await db.booking.update({
      where: { id: booking.id },
      data: { guaranteeExpiresAt: new Date(Date.now() - 60_000) },
    });

    const failure = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back a month later',
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('GUARANTEE_EXPIRED');
  });

  it('honours a window that was frozen while the programme was more generous', async () => {
    // The booking was completed with 30 days on it; shortening the platform
    // default afterwards must not retroactively cancel this customer's cover.
    const { customer, booking } = await completedBooking({ guarantee: true, days: 30 });
    await setSettingValue('guarantee.days', 3);

    const claim = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault returned on day 20',
    });
    expect(claim.status).toBe('SUBMITTED');
  });

  it('refuses every claim while the programme is switched off', async () => {
    await setSettingValue('guarantee.enabled', false);
    const { customer, booking } = await completedBooking({ guarantee: true });

    const failure = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back',
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('GUARANTEE_NOT_ELIGIBLE');
  });

  it('refuses a claim from anybody but the booking customer', async () => {
    const { stranger, providerUser, booking } = await completedBooking({ guarantee: true });

    for (const userId of [stranger.id, providerUser.id]) {
      await expect(
        submitGuaranteeClaim({
          bookingId: booking.id,
          raisedByUserId: userId,
          description: 'Not my booking',
        }),
      ).rejects.toThrow(/only the customer on this booking/i);
    }
  });

  it('refuses a second claim while one is still being reviewed', async () => {
    const { customer, booking } = await completedBooking({ guarantee: true });
    await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back',
    });

    await expect(
      submitGuaranteeClaim({
        bookingId: booking.id,
        raisedByUserId: customer.id,
        description: 'Still not fixed',
      }),
    ).rejects.toThrow(/already a claim under review/i);
  });

  it('lets a customer claim again after a rejection', async () => {
    const { customer, admin, booking } = await completedBooking({ guarantee: true });
    const first = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back',
    });
    await decideGuaranteeClaim({
      claimId: first.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'REJECTED',
      notes: 'Different fault, unrelated to the original job',
    });

    const second = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'The original fault, this time with photos',
    });
    expect(second.status).toBe('SUBMITTED');
  });

  it('schedules a re-visit and records who bears the cost', async () => {
    const { customer, admin, booking } = await completedBooking({ guarantee: true });
    const claim = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back on day two',
    });

    const revisitAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const decided = await decideGuaranteeClaim({
      claimId: claim.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'REVISIT_SCHEDULED',
      revisitScheduledFor: revisitAt,
      notes: 'Same technician to return',
    });

    expect(decided.status).toBe('REVISIT_SCHEDULED');
    expect(decided.revisitScheduledFor?.toISOString()).toBe(revisitAt.toISOString());
    // Who pays is recorded explicitly rather than left implied.
    expect(decided.providerResponsible).toBe(true);
  });

  it('lets staff override the default responsibility for one claim', async () => {
    const { customer, admin, booking } = await completedBooking({ guarantee: true });
    const claim = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back',
    });

    const decided = await decideGuaranteeClaim({
      claimId: claim.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'APPROVED',
      providerResponsible: false,
      notes: 'Part failure, not workmanship — platform absorbs this one',
    });

    expect(decided.providerResponsible).toBe(false);
    expect(decided.decidedByUserId).toBe(admin.id);
    expect(decided.decidedAt).not.toBeNull();
  });

  it('records the decision in the audit log and tells both parties', async () => {
    const { customer, providerUser, admin, booking } = await completedBooking({ guarantee: true });
    const claim = await submitGuaranteeClaim({
      bookingId: booking.id,
      raisedByUserId: customer.id,
      description: 'Fault came back',
    });
    await decideGuaranteeClaim({
      claimId: claim.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      status: 'APPROVED',
    });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: 'GuaranteeClaim', entityId: claim.id },
    });
    expect(entry.actorUserId).toBe(admin.id);

    for (const userId of [customer.id, providerUser.id]) {
      expect(
        await db.notification.count({ where: { userId, event: 'guarantee.update' } }),
      ).toBeGreaterThan(0);
    }
  });
});
