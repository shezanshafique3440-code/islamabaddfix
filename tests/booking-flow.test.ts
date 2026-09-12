import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  acceptBooking,
  cancelBooking,
  createBooking,
  declineBooking,
} from '@/lib/bookings/service';
import { approveQuote, completeBooking, rejectQuote, submitQuote } from '@/lib/bookings/quotes';
import { transitionBooking } from '@/lib/bookings/transition';
import { createReview } from '@/lib/bookings/reviews';
import {
  createAddress,
  createProvider,
  createService,
  createUser,
  createZone,
  db,
  setSettingValue,
  tomorrowAt,
} from './helpers';
import { truncateAll } from './setup';

/** Shared fixture: one customer, one verified provider, one service, one zone. */
async function scenario(options: { emergency?: boolean; requiresInspection?: boolean } = {}) {
  const customer = await createUser({ role: 'CUSTOMER' });
  const service = await createService({
    isEmergencyEnabled: options.emergency ?? false,
    requiresInspection: options.requiresInspection ?? true,
  });
  const zone = await createZone();
  const { provider, user: providerUser } = await createProvider({
    serviceIds: [service.id],
    zoneIds: [zone.id],
    emergencyAvailable: options.emergency ?? false,
  });
  const address = await createAddress(customer.id, zone.id);
  return { customer, service, zone, provider, providerUser, address };
}

describe('booking creation', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('refuses an address that belongs to somebody else', async () => {
    const { service, zone } = await scenario();
    const owner = await createUser({ role: 'CUSTOMER' });
    const attacker = await createUser({ role: 'CUSTOMER' });
    const address = await createAddress(owner.id, zone.id);

    // This is the check that stops one customer booking work at another's home.
    await expect(
      createBooking({
        customerId: attacker.id,
        serviceId: service.id,
        addressId: address.id,
        problemDescription: 'Trying to use somebody else address',
        scheduledFor: tomorrowAt(),
      }),
    ).rejects.toThrow(/aapke account mein nahi/i);

    expect(await db.booking.count()).toBe(0);
  });

  it('refuses an inactive service', async () => {
    const { customer, service, address } = await scenario();
    await db.service.update({ where: { id: service.id }, data: { isActive: false } });

    await expect(
      createBooking({
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        problemDescription: 'Service was retired',
        scheduledFor: tomorrowAt(),
      }),
    ).rejects.toThrow(/available nahi/i);
  });

  it('refuses a slot inside the minimum lead time', async () => {
    const { customer, service, address } = await scenario();
    await setSettingValue('booking.minLeadMinutes', 120);

    await expect(
      createBooking({
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        problemDescription: 'Booking too soon',
        scheduledFor: new Date(Date.now() + 10 * 60_000),
      }),
    ).rejects.toThrow(/kam az kam/i);
  });

  it('refuses a slot beyond the maximum lead time', async () => {
    const { customer, service, address } = await scenario();
    await setSettingValue('booking.maxLeadDays', 7);

    const tooFar = new Date();
    tooFar.setDate(tooFar.getDate() + 30);

    await expect(
      createBooking({
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        problemDescription: 'Booking too far ahead',
        scheduledFor: tooFar,
      }),
    ).rejects.toThrow(/se zyada aage/i);
  });

  it('refuses an unverified provider for a public booking', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      status: 'PENDING_VERIFICATION',
    });
    const address = await createAddress(customer.id, zone.id);

    const failure = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Trying an unverified provider',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('PROVIDER_NOT_VERIFIED');
  });

  it('refuses a suspended provider', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      status: 'SUSPENDED',
    });
    const address = await createAddress(customer.id, zone.id);

    const failure = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Trying a suspended provider',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('PROVIDER_SUSPENDED');
  });

  it('refuses a provider who is at capacity', async () => {
    const { customer, service, zone, provider } = await scenario();
    await db.providerProfile.update({
      where: { id: provider.id },
      data: { maxActiveJobs: 1 },
    });

    const address = await createAddress(customer.id, zone.id);
    // Fill the single slot.
    await db.booking.create({
      data: {
        reference: 'IFX-FULL01',
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        providerId: provider.id,
        status: 'IN_PROGRESS',
        problemDescription: 'Existing job occupying capacity',
      },
    });

    const failure = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Should not fit',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('PROVIDER_AT_CAPACITY');
  });

  it('refuses a provider who does not offer the service', async () => {
    const { customer, zone, provider, address } = await scenario();
    const otherService = await createService();

    await expect(
      createBooking({
        customerId: customer.id,
        serviceId: otherService.id,
        addressId: address.id,
        problemDescription: 'Provider does not do this',
        providerId: provider.id,
        scheduledFor: tomorrowAt(),
      }),
    ).rejects.toThrow(/offer nahi karta/i);
    void zone;
  });

  it('stays PENDING when nothing matches, rather than pretending', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService();
    const zone = await createZone();
    const address = await createAddress(customer.id, zone.id);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'No provider exists for this at all',
      scheduledFor: tomorrowAt(),
    });

    expect(result.offeredProviderIds).toEqual([]);
    // Honest state: the request is real and queued for manual assignment.
    expect(result.booking.status).toBe('PENDING');
    expect(result.booking.providerId).toBeNull();
  });

  it('fans out to matched providers when the customer does not choose one', async () => {
    const { customer, service, address } = await scenario();
    await setSettingValue('booking.offerFanout', 5);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Let the platform choose for me',
      scheduledFor: tomorrowAt(),
    });

    expect(result.offeredProviderIds.length).toBeGreaterThan(0);
    expect(result.booking.status).toBe('PROVIDER_NOTIFIED');
    expect(result.booking.providerId).toBeNull();
  });

  it('applies the emergency fee from the provider, not the request', async () => {
    const { customer, service, address, provider } = await scenario({ emergency: true });
    await setSettingValue('emergency.enabled', true);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Emergency AC failure',
      providerId: provider.id,
      isEmergency: true,
    });

    // The fixture sets the provider's own emergency fee to Rs. 800.
    expect(result.booking.emergencyFeePaisa).toBe(80_000);
    expect(result.booking.isEmergency).toBe(true);
    expect(result.booking.urgency).toBe('EMERGENCY');
  });

  it('refuses emergency booking for a service that does not allow it', async () => {
    const { customer, service, address } = await scenario({ emergency: false });
    await setSettingValue('emergency.enabled', true);

    await expect(
      createBooking({
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        problemDescription: 'Not an emergency service',
        isEmergency: true,
      }),
    ).rejects.toThrow(/emergency booking available nahi/i);
  });
});

describe('offers and acceptance', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  it('refuses acceptance from a provider who was not offered the job', async () => {
    const { customer, service, address, provider } = await scenario();
    const zone2 = await createZone();
    const outsider = await createProvider({ serviceIds: [service.id], zoneIds: [zone2.id] });

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Only one provider was asked',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    });

    await expect(
      acceptBooking({
        bookingId: result.booking.id,
        providerId: outsider.provider.id,
        actorUserId: outsider.user.id,
      }),
    ).rejects.toThrow(/offer nahi hui/i);
  });

  it('gives the job to whoever accepts first and closes the other offers', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService();
    const zone = await createZone();
    const first = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const second = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const address = await createAddress(customer.id, zone.id);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Race between two providers',
      scheduledFor: tomorrowAt(),
    });
    expect(result.offeredProviderIds).toHaveLength(2);

    await acceptBooking({
      bookingId: result.booking.id,
      providerId: first.provider.id,
      actorUserId: first.user.id,
    });

    // The loser's offer is closed out, not left dangling in their inbox.
    const losing = await db.bookingOffer.findFirstOrThrow({
      where: { bookingId: result.booking.id, providerId: second.provider.id },
    });
    expect(losing.respondedAt).not.toBeNull();
    expect(losing.accepted).toBe(false);
    expect(losing.declineReason).toBe('taken_by_other_provider');

    await expect(
      acceptBooking({
        bookingId: result.booking.id,
        providerId: second.provider.id,
        actorUserId: second.user.id,
      }),
    ).rejects.toThrow(/doosre technician/i);
  });

  it('returns the booking to PENDING when every provider declines', async () => {
    const { customer, service, address, provider, providerUser } = await scenario();

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Everyone will decline this',
      scheduledFor: tomorrowAt(),
    });

    await declineBooking({
      bookingId: result.booking.id,
      providerId: provider.id,
      reason: 'Busy',
    });
    void providerUser;

    const booking = await db.booking.findUniqueOrThrow({ where: { id: result.booking.id } });
    expect(booking.status).toBe('PENDING');
  });

  it('updates the provider response rate from their offer history', async () => {
    const { customer, service, address, provider, providerUser } = await scenario();

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Measure response rate',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    });
    await acceptBooking({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });

    const updated = await db.providerProfile.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updated.acceptedJobs).toBe(1);
    expect(updated.responseRate).toBeGreaterThan(0);
    expect(updated.avgResponseMinutes).not.toBeNull();
  });
});

describe('quotes and additional charges', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  async function acceptedBooking() {
    const fixture = await scenario();
    const result = await createBooking({
      customerId: fixture.customer.id,
      serviceId: fixture.service.id,
      addressId: fixture.address.id,
      problemDescription: 'Needs a quote',
      providerId: fixture.provider.id,
      scheduledFor: tomorrowAt(),
    });
    await acceptBooking({
      bookingId: result.booking.id,
      providerId: fixture.provider.id,
      actorUserId: fixture.providerUser.id,
    });
    return { ...fixture, bookingId: result.booking.id };
  }

  it('ignores any client-supplied total and sums the line items', async () => {
    const { bookingId, provider, providerUser } = await acceptedBooking();

    const quote = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [
        { kind: 'LABOUR', label: 'Labour', quantity: 2, unitPricePaisa: 50_000 },
        { kind: 'PARTS', label: 'Parts', quantity: 3, unitPricePaisa: 10_000 },
      ],
    });

    // 2 × 500 + 3 × 100 = Rs. 1,300.
    expect(quote.subtotalPaisa).toBe(130_000);
  });

  it('refuses a quote from a provider who is not assigned', async () => {
    const { bookingId, service } = await acceptedBooking();
    const zone = await createZone();
    const other = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    await expect(
      submitQuote({
        bookingId,
        providerId: other.provider.id,
        actorUserId: other.user.id,
        items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 50_000 }],
      }),
    ).rejects.toThrow(/assign nahi hui/i);
  });

  it('supersedes an earlier undecided quote', async () => {
    const { bookingId, provider, providerUser } = await acceptedBooking();

    const first = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'First guess', unitPricePaisa: 50_000 }],
    });
    await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Revised', unitPricePaisa: 90_000 }],
    });

    const superseded = await db.quote.findUniqueOrThrow({ where: { id: first.id } });
    expect(superseded.status).toBe('SUPERSEDED');
    expect(await db.quote.count({ where: { bookingId, status: 'SUBMITTED' } })).toBe(1);
  });

  it('lets only the booking customer decide a quote', async () => {
    const { bookingId, provider, providerUser } = await acceptedBooking();
    const stranger = await createUser({ role: 'CUSTOMER' });

    const quote = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 50_000 }],
    });

    await expect(approveQuote({ quoteId: quote.id, customerUserId: stranger.id })).rejects.toThrow(
      /aapki booking ka nahi/i,
    );
  });

  it('returns the booking to ACCEPTED when the quote is rejected', async () => {
    const { bookingId, customer, provider, providerUser } = await acceptedBooking();

    const quote = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Too expensive', unitPricePaisa: 900_000 }],
    });
    await rejectQuote({
      quoteId: quote.id,
      customerUserId: customer.id,
      reason: 'Bohat zyada hai',
    });

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    // Back to ACCEPTED so the provider can re-quote, and still no agreed price.
    expect(booking.status).toBe('ACCEPTED');
    expect(booking.approvedTotalPaisa).toBeNull();

    const rejected = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('Bohat zyada hai');
  });

  it('requires separate approval for mid-job additional charges', async () => {
    const { bookingId, customer, provider, providerUser } = await acceptedBooking();

    // Initial quote, approved, work under way.
    const initial = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 100_000 }],
    });
    await approveQuote({ quoteId: initial.id, customerUserId: customer.id });
    await transitionBooking({
      bookingId,
      to: 'SCHEDULED',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await transitionBooking({
      bookingId,
      to: 'ARRIVED',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await transitionBooking({
      bookingId,
      to: 'IN_PROGRESS',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });

    // Extra part discovered mid-job.
    const extra = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'PARTS', label: 'Extra part', unitPricePaisa: 60_000 }],
    });
    expect(extra.isAdditional).toBe(true);

    // Completion is blocked while the customer has not decided.
    await expect(
      completeBooking({ bookingId, providerId: provider.id, actorUserId: providerUser.id }),
    ).rejects.toThrow(/pending charges/i);

    // Approving stacks it on top and hands the job back mid-flight.
    const approved = await approveQuote({ quoteId: extra.id, customerUserId: customer.id });
    expect(approved.approvedTotalPaisa).toBe(160_000);

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('IN_PROGRESS');
    expect(booking.approvedTotalPaisa).toBe(160_000);

    await completeBooking({ bookingId, providerId: provider.id, actorUserId: providerUser.id });
    const completed = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(completed.finalTotalPaisa).toBe(160_000);
    // Rs. 1,600 at 10%.
    expect(completed.commissionPaisa).toBe(16_000);
  });

  it('leaves the agreed price untouched when extra charges are rejected', async () => {
    const { bookingId, customer, provider, providerUser } = await acceptedBooking();

    const initial = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 100_000 }],
    });
    await approveQuote({ quoteId: initial.id, customerUserId: customer.id });

    const extra = await submitQuote({
      bookingId,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'PARTS', label: 'Optional upgrade', unitPricePaisa: 500_000 }],
    });
    await rejectQuote({ quoteId: extra.id, customerUserId: customer.id, reason: 'Nahi chahiye' });

    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.approvedTotalPaisa).toBe(100_000);
  });

  it('adds a disclosed emergency fee to the first approved quote', async () => {
    const fixture = await scenario({ emergency: true });
    await setSettingValue('emergency.enabled', true);

    const result = await createBooking({
      customerId: fixture.customer.id,
      serviceId: fixture.service.id,
      addressId: fixture.address.id,
      problemDescription: 'Emergency job with a fee',
      providerId: fixture.provider.id,
      isEmergency: true,
    });
    await acceptBooking({
      bookingId: result.booking.id,
      providerId: fixture.provider.id,
      actorUserId: fixture.providerUser.id,
    });

    const quote = await submitQuote({
      bookingId: result.booking.id,
      providerId: fixture.provider.id,
      actorUserId: fixture.providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 100_000 }],
    });
    const approved = await approveQuote({
      quoteId: quote.id,
      customerUserId: fixture.customer.id,
    });

    // Rs. 1,000 labour + Rs. 800 emergency fee disclosed before booking.
    expect(approved.approvedTotalPaisa).toBe(180_000);
  });
});

describe('cancellation', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('booking.freeCancellationMinutes', 120);
    await setSettingValue('booking.cancellationFeePaisa', 30_000);
  });

  it('is free outside the window', async () => {
    const { customer, service, address, provider } = await scenario();
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Cancelling well ahead of time',
      providerId: provider.id,
      scheduledFor: later,
    });

    const cancelled = await cancelBooking({
      bookingId: result.booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      reason: 'Plan badal gaya',
    });

    expect(cancelled.feePaisa).toBe(0);
    expect(cancelled.booking.status).toBe('CANCELLED');
    expect(cancelled.booking.cancellationReason).toBe('Plan badal gaya');
  });

  it('charges the late fee inside the window', async () => {
    const { customer, service, address, provider } = await scenario();
    await setSettingValue('booking.minLeadMinutes', 0);
    const soon = new Date(Date.now() + 30 * 60_000);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Cancelling at short notice',
      providerId: provider.id,
      scheduledFor: soon,
    });

    const cancelled = await cancelBooking({
      bookingId: result.booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      reason: 'Ghar par koi nahi',
    });

    expect(cancelled.feePaisa).toBe(30_000);
  });

  it('never charges the customer when staff cancel', async () => {
    const { customer, service, address, provider } = await scenario();
    await setSettingValue('booking.minLeadMinutes', 0);
    const admin = await createUser({ role: 'ADMIN' });
    const soon = new Date(Date.now() + 30 * 60_000);

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Ops cancelling on the customer behalf',
      providerId: provider.id,
      scheduledFor: soon,
    });

    const cancelled = await cancelBooking({
      bookingId: result.booking.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      reason: 'Provider unreachable',
    });

    expect(cancelled.feePaisa).toBe(0);
  });

  it('refuses to cancel a completed booking', async () => {
    const { customer, service, address, provider, providerUser } = await scenario();
    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Already finished',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    });
    await acceptBooking({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });
    const quote = await submitQuote({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 100_000 }],
    });
    await approveQuote({ quoteId: quote.id, customerUserId: customer.id });
    await transitionBooking({
      bookingId: result.booking.id,
      to: 'SCHEDULED',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await transitionBooking({
      bookingId: result.booking.id,
      to: 'ARRIVED',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await transitionBooking({
      bookingId: result.booking.id,
      to: 'IN_PROGRESS',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await completeBooking({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });

    const failure = await cancelBooking({
      bookingId: result.booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      reason: 'Changed my mind',
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('CANCELLATION_NOT_ALLOWED');
  });

  it('withdraws outstanding offers when a booking is cancelled', async () => {
    const { customer, service, address } = await scenario();
    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Cancel before anyone accepts',
      scheduledFor: tomorrowAt(),
    });

    await cancelBooking({
      bookingId: result.booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      reason: 'Masla khud theek ho gaya',
    });

    const offers = await db.bookingOffer.findMany({ where: { bookingId: result.booking.id } });
    expect(offers.every((offer) => offer.respondedAt !== null)).toBe(true);
  });
});

describe('reviews', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  it('refuses a review before the booking is completed', async () => {
    const { customer, service, address, provider } = await scenario();
    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Not finished yet',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    });

    const failure = await createReview({
      bookingId: result.booking.id,
      authorId: customer.id,
      rating: 5,
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('REVIEW_NOT_ALLOWED');
  });

  it('refuses a review from somebody who is not the customer', async () => {
    const { customer, service, address, provider, providerUser } = await scenario();
    const stranger = await createUser({ role: 'CUSTOMER' });

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Someone else will try to review this',
      providerId: provider.id,
      scheduledFor: tomorrowAt(),
    });
    await acceptBooking({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });
    const quote = await submitQuote({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 100_000 }],
    });
    await approveQuote({ quoteId: quote.id, customerUserId: customer.id });
    await transitionBooking({
      bookingId: result.booking.id,
      to: 'SCHEDULED',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await transitionBooking({
      bookingId: result.booking.id,
      to: 'ARRIVED',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await transitionBooking({
      bookingId: result.booking.id,
      to: 'IN_PROGRESS',
      actorRole: 'PROVIDER',
      actorUserId: providerUser.id,
    });
    await completeBooking({
      bookingId: result.booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });

    await expect(
      createReview({ bookingId: result.booking.id, authorId: stranger.id, rating: 1 }),
    ).rejects.toThrow(/sirf booking ka customer/i);
  });

  it('averages multiple reviews across a provider', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider, user: providerUser } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
    });

    for (const rating of [5, 4]) {
      const customer = await createUser({ role: 'CUSTOMER' });
      const address = await createAddress(customer.id, zone.id);
      const result = await createBooking({
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        problemDescription: `Rating ${rating} booking`,
        providerId: provider.id,
        scheduledFor: tomorrowAt(),
      });
      await acceptBooking({
        bookingId: result.booking.id,
        providerId: provider.id,
        actorUserId: providerUser.id,
      });
      const quote = await submitQuote({
        bookingId: result.booking.id,
        providerId: provider.id,
        actorUserId: providerUser.id,
        items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 100_000 }],
      });
      await approveQuote({ quoteId: quote.id, customerUserId: customer.id });
      for (const to of ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS'] as const) {
        await transitionBooking({
          bookingId: result.booking.id,
          to,
          actorRole: 'PROVIDER',
          actorUserId: providerUser.id,
        });
      }
      await completeBooking({
        bookingId: result.booking.id,
        providerId: provider.id,
        actorUserId: providerUser.id,
      });
      await createReview({ bookingId: result.booking.id, authorId: customer.id, rating });
    }

    const updated = await db.providerProfile.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updated.ratingCount).toBe(2);
    expect(updated.ratingAverage).toBe(4.5);
  });
});
