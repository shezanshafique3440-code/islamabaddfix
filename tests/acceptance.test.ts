import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/service';
import { acceptBooking, createBooking } from '@/lib/bookings/service';
import { approveQuote, completeBooking, submitQuote } from '@/lib/bookings/quotes';
import { createReview } from '@/lib/bookings/reviews';
import { transitionBooking } from '@/lib/bookings/transition';
import { findMatchingProviders } from '@/lib/matching/engine';
import { initiatePayment, settlePayment } from '@/lib/payments';
import { getOverviewMetrics } from '@/lib/analytics';
import { splitCommission } from '@/lib/money';
import {
  createAddress,
  createProvider,
  createService,
  createZone,
  db,
  setSettingValue,
  tomorrowAt,
} from './helpers';
import { truncateAll } from './setup';

/**
 * The acceptance scenario from section 58 of the brief, executed end to end
 * against a real database.
 *
 * Every step asserts the database state it should have produced, because the
 * point of the exercise is that the data is real — not that the functions
 * returned without throwing.
 */
describe('acceptance: AC repair booking, start to finish', () => {
  let customerId: string;
  let providerId: string;
  let providerUserId: string;
  let serviceId: string;
  let addressId: string;
  let bookingId: string;
  let quoteId: string;

  const INSPECTION_PAISA = 50_000; // Rs. 500
  const LABOUR_PAISA = 100_000; // Rs. 1,000
  const PARTS_PAISA = 180_000; // Rs. 1,800
  const EXPECTED_TOTAL = INSPECTION_PAISA + LABOUR_PAISA + PARTS_PAISA; // Rs. 3,300
  const COMMISSION_RATE_BP = 1000; // 10%

  beforeAll(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', COMMISSION_RATE_BP);
    await setSettingValue('guarantee.enabled', true);
    await setSettingValue('guarantee.days', 7);
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('step 1: customer registers', async () => {
    const session = await registerUser(
      {
        email: 'acceptance.customer@test.local',
        password: 'StrongPass123',
        fullName: 'Ayesha Khan',
        phone: '03001234567',
      },
      { ipAddress: '203.0.113.9', userAgent: 'vitest' },
    );
    customerId = session.user.id;

    const persisted = await db.user.findUniqueOrThrow({ where: { id: customerId } });
    expect(persisted.role).toBe('CUSTOMER');
    expect(persisted.email).toBe('acceptance.customer@test.local');
    // The password is hashed, never stored as given.
    expect(persisted.passwordHash).not.toContain('StrongPass123');
  });

  it('step 2: catalogue offers AC → AC Repair, and a verified provider covers it', async () => {
    const service = await createService({
      name: 'AC Repair',
      minPricePaisa: 150_000,
      requiresInspection: true,
      guaranteeEligible: true,
    });
    serviceId = service.id;

    const zone = await createZone('G-10');
    const created = await createProvider({
      serviceIds: [serviceId],
      zoneIds: [zone.id],
      status: 'VERIFIED',
    });
    providerId = created.provider.id;
    providerUserId = created.user.id;

    addressId = (await createAddress(customerId, zone.id)).id;

    expect(await db.service.count({ where: { isActive: true } })).toBe(1);
    expect(created.provider.status).toBe('VERIFIED');
  });

  it('step 3: the matching engine surfaces the verified provider', async () => {
    const candidates = await findMatchingProviders({
      serviceId,
      zoneId: (await db.address.findUniqueOrThrow({ where: { id: addressId } })).zoneId,
      scheduledFor: tomorrowAt(17),
      urgency: 'NORMAL',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.providerId).toBe(providerId);
    // The score is a weighted sum of normalised signals, so it is positive and
    // bounded by the sum of the configured weights.
    expect(candidates[0]!.score).toBeGreaterThan(0);
    expect(candidates[0]!.breakdown.serviceMatch).toBeGreaterThan(0);
  });

  it('step 4: booking is created with the problem description and schedule', async () => {
    const result = await createBooking({
      customerId,
      serviceId,
      addressId,
      problemDescription: 'AC cooling nahi kar raha.',
      providerId,
      scheduledFor: tomorrowAt(17),
    });
    bookingId = result.booking.id;

    expect(result.booking.reference).toMatch(/^IFX-[2-9A-HJ-NP-TV-Z]{6}$/);
    expect(result.booking.problemDescription).toBe('AC cooling nahi kar raha.');
    expect(result.offeredProviderIds).toEqual([providerId]);

    // The customer's chosen provider was notified, and status history recorded it.
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } }, offers: true },
    });
    expect(booking.status).toBe('PROVIDER_NOTIFIED');
    expect(booking.offers).toHaveLength(1);
    expect(booking.statusHistory.map((entry) => entry.toStatus)).toEqual([
      'PENDING',
      'PROVIDER_NOTIFIED',
    ]);

    // The customer got an in-app notification about their own booking.
    const notification = await db.notification.findFirst({
      where: { userId: customerId, event: 'booking.created', channel: 'IN_APP' },
    });
    expect(notification).not.toBeNull();
  });

  it('step 5: provider accepts, and the customer is told', async () => {
    const booking = await acceptBooking({ bookingId, providerId, actorUserId: providerUserId });
    expect(booking.status).toBe('ACCEPTED');
    expect(booking.acceptedAt).not.toBeNull();

    const offer = await db.bookingOffer.findFirstOrThrow({ where: { bookingId, providerId } });
    expect(offer.accepted).toBe(true);
    expect(offer.respondedAt).not.toBeNull();

    const notification = await db.notification.findFirst({
      where: { userId: customerId, event: 'booking.accepted' },
    });
    expect(notification).not.toBeNull();
  });

  it('step 6: provider submits an itemised quote totalling Rs. 3,300', async () => {
    const quote = await submitQuote({
      bookingId,
      providerId,
      actorUserId: providerUserId,
      items: [
        { kind: 'INSPECTION', label: 'Muaina', unitPricePaisa: INSPECTION_PAISA },
        { kind: 'LABOUR', label: 'Mazdoori', unitPricePaisa: LABOUR_PAISA },
        { kind: 'PARTS', label: 'Capacitor', unitPricePaisa: PARTS_PAISA },
      ],
    });
    quoteId = quote.id;

    // The total is summed server-side from the line items.
    expect(quote.subtotalPaisa).toBe(EXPECTED_TOTAL);
    expect(quote.status).toBe('SUBMITTED');
    expect(quote.isAdditional).toBe(false);

    const items = await db.quoteItem.findMany({ where: { quoteId } });
    expect(items).toHaveLength(3);

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('QUOTE_PENDING');
    // Nothing is owed until the customer approves.
    expect(booking.approvedTotalPaisa).toBeNull();
  });

  it('step 7: completion is refused while the quote is unapproved', async () => {
    // This is the load-bearing rule: no work is billable without agreement.
    await expect(
      completeBooking({ bookingId, providerId, actorUserId: providerUserId }),
    ).rejects.toThrow(/approve/i);

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('QUOTE_PENDING');
  });

  it('step 8: customer approves the quote, freezing the agreed total', async () => {
    const result = await approveQuote({ quoteId, customerUserId: customerId });
    expect(result.approvedTotalPaisa).toBe(EXPECTED_TOTAL);

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('QUOTE_APPROVED');
    expect(booking.approvedTotalPaisa).toBe(EXPECTED_TOTAL);

    const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe('APPROVED');
    expect(quote.respondedAt).not.toBeNull();

    const notification = await db.notification.findFirst({
      where: { userId: providerUserId, event: 'quote.approved' },
    });
    expect(notification).not.toBeNull();
  });

  it('step 9: booking becomes SCHEDULED', async () => {
    const result = await transitionBooking({
      bookingId,
      to: 'SCHEDULED',
      actorRole: 'PROVIDER',
      actorUserId: providerUserId,
    });
    expect(result.booking.status).toBe('SCHEDULED');
  });

  it('step 10: provider marks ON_THE_WAY, then ARRIVED', async () => {
    const onTheWay = await transitionBooking({
      bookingId,
      to: 'ON_THE_WAY',
      actorRole: 'PROVIDER',
      actorUserId: providerUserId,
    });
    expect(onTheWay.booking.status).toBe('ON_THE_WAY');
    expect(onTheWay.booking.onTheWayAt).not.toBeNull();

    const arrived = await transitionBooking({
      bookingId,
      to: 'ARRIVED',
      actorRole: 'PROVIDER',
      actorUserId: providerUserId,
    });
    expect(arrived.booking.status).toBe('ARRIVED');
    expect(arrived.booking.arrivedAt).not.toBeNull();
  });

  it('step 11: provider starts the job', async () => {
    const result = await transitionBooking({
      bookingId,
      to: 'IN_PROGRESS',
      actorRole: 'PROVIDER',
      actorUserId: providerUserId,
    });
    expect(result.booking.status).toBe('IN_PROGRESS');
    expect(result.booking.startedAt).not.toBeNull();
  });

  it('step 12: provider completes the job and commission is computed server-side', async () => {
    await completeBooking({
      bookingId,
      providerId,
      actorUserId: providerUserId,
      completionNotes: 'Capacitor badla, cooling test ki.',
    });

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('COMPLETED');
    expect(booking.completedAt).not.toBeNull();
    expect(booking.finalTotalPaisa).toBe(EXPECTED_TOTAL);

    // Commission is frozen at the rate in force at completion.
    const expected = splitCommission(EXPECTED_TOTAL, COMMISSION_RATE_BP);
    expect(booking.commissionRateBp).toBe(COMMISSION_RATE_BP);
    expect(booking.commissionPaisa).toBe(expected.commissionPaisa);
    expect(booking.providerEarningsPaisa).toBe(expected.providerEarningsPaisa);
    // Rs. 3,300 at 10% => Rs. 330 platform, Rs. 2,970 provider.
    expect(booking.commissionPaisa).toBe(33_000);
    expect(booking.providerEarningsPaisa).toBe(297_000);

    // The guarantee window was set from the settings in force at completion.
    expect(booking.guaranteeEligible).toBe(true);
    expect(booking.guaranteeDays).toBe(7);
    expect(booking.guaranteeExpiresAt).not.toBeNull();

    // Provider and customer counters advanced.
    const provider = await db.providerProfile.findUniqueOrThrow({ where: { id: providerId } });
    expect(provider.completedJobs).toBe(1);
    const profile = await db.customerProfile.findFirstOrThrow({ where: { userId: customerId } });
    expect(profile.completedBookings).toBe(1);
  });

  it('step 13: customer records the cash payment', async () => {
    const initiated = await initiatePayment({
      bookingId,
      method: 'CASH',
      actorUserId: customerId,
    });
    // Cash is deferred, so it starts PENDING rather than pretending to be paid.
    expect(initiated.payment.status).toBe('PENDING');
    expect(initiated.payment.amountPaisa).toBe(EXPECTED_TOTAL);
    expect(initiated.note).toBeTruthy();

    const settled = await settlePayment({
      paymentId: initiated.payment.id,
      actorUserId: customerId,
      actorRole: 'CUSTOMER',
    });
    expect(settled.status).toBe('PAID');
    expect(settled.paidAt).not.toBeNull();

    const payment = await db.payment.findUniqueOrThrow({ where: { id: initiated.payment.id } });
    expect(payment.amountPaisa).toBe(EXPECTED_TOTAL);
    expect(payment.method).toBe('CASH');
  });

  it('step 14: customer submits a review and the provider rating updates', async () => {
    const review = await createReview({
      bookingId,
      authorId: customerId,
      rating: 5,
      comment: 'Waqt par aaye aur masla theek kar diya.',
      serviceQuality: 5,
      professionalism: 5,
      punctuality: 4,
      valueForMoney: 5,
    });

    expect(review.rating).toBe(5);
    expect(review.isPublished).toBe(true);

    const provider = await db.providerProfile.findUniqueOrThrow({ where: { id: providerId } });
    expect(provider.ratingAverage).toBe(5);
    expect(provider.ratingCount).toBe(1);
  });

  it('step 15: a second review on the same booking is refused', async () => {
    await expect(
      createReview({ bookingId, authorId: customerId, rating: 1 }),
    ).rejects.toThrow(/pehle de chuke/i);

    expect(await db.review.count({ where: { bookingId } })).toBe(1);
  });

  it('step 16: admin sees the completed booking and its commission', async () => {
    const metrics = await getOverviewMetrics();

    expect(metrics.bookings.total).toBe(1);
    expect(metrics.bookings.completedToday).toBe(1);
    expect(metrics.revenue.todayGrossPaisa).toBe(EXPECTED_TOTAL);
    expect(metrics.revenue.todayCommissionPaisa).toBe(33_000);
    expect(metrics.revenue.averageOrderValuePaisa).toBe(EXPECTED_TOTAL);
    expect(metrics.quality.averageRating).toBe(5);
    expect(metrics.providers.verified).toBe(1);
  });

  it('records the full audit trail for the booking', async () => {
    const history = await db.bookingStatusHistory.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });

    // Every stage the booking passed through is on the record.
    expect(history.map((entry) => entry.toStatus)).toEqual([
      'PENDING',
      'PROVIDER_NOTIFIED',
      'ACCEPTED',
      'QUOTE_PENDING',
      'QUOTE_APPROVED',
      'SCHEDULED',
      'ON_THE_WAY',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
    ]);

    const audit = await db.auditLog.findMany({ where: { entity: 'Booking' } });
    expect(audit.length).toBeGreaterThanOrEqual(9);

    const quoteAudit = await db.auditLog.findMany({ where: { entity: 'Quote' } });
    expect(quoteAudit.map((entry) => entry.action)).toContain('quote.submitted');
    expect(quoteAudit.map((entry) => entry.action)).toContain('quote.decided');
  });
});
