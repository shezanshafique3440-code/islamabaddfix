import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOffers, findMatchingProviders, recordOfferResponse } from '@/lib/matching/engine';
import {
  createProvider,
  createService,
  createUser,
  createZone,
  db,
  setSettingValue,
} from './helpers';
import { truncateAll } from './setup';

/**
 * Matching engine.
 *
 * The split the engine is built around is the thing worth testing: hard filters
 * decide *whether* a provider can take the job at all (no score can override
 * them), and soft scoring decides only the order. A bug that lets an unverified
 * or out-of-area provider through is a product failure; a bug in the ordering is
 * a tuning problem.
 */

/** Saturday 14:00 PKT — inside the Mon–Sat 09:00–19:00 fixture windows. */
function saturdayAfternoonPkt(): Date {
  const date = new Date(Date.UTC(2026, 8, 12, 9, 0, 0)); // 14:00 PKT, a Saturday
  return date;
}

async function fill(providerId: string, count: number, serviceId: string, addressUserId: string) {
  const zone = await createZone();
  const address = await db.address.create({
    data: {
      userId: addressUserId,
      label: `Site ${randomUUID().slice(0, 6)}`,
      zoneId: zone.id,
      addressLine: 'House 1, Street 1',
      isDefault: false,
    },
  });
  for (let index = 0; index < count; index += 1) {
    await db.booking.create({
      data: {
        reference: `IFX-M-${randomUUID().slice(0, 8)}`,
        customerId: addressUserId,
        serviceId,
        addressId: address.id,
        providerId,
        status: 'IN_PROGRESS',
        problemDescription: 'Occupying capacity',
      },
    });
  }
}

describe('matching hard filters', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('returns a verified, in-area provider who offers the service', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    expect(matches.map((m) => m.providerId)).toEqual([provider.id]);
  });

  it('excludes providers who are not VERIFIED, whatever their other signals', async () => {
    const service = await createService();
    const zone = await createZone();
    for (const status of ['PENDING_VERIFICATION', 'SUSPENDED', 'REJECTED'] as const) {
      const { provider } = await createProvider({
        serviceIds: [service.id],
        zoneIds: [zone.id],
        status,
      });
      // Give the excluded provider a perfect record, to prove score cannot win.
      await db.providerProfile.update({
        where: { id: provider.id },
        data: { ratingAverage: 5, ratingCount: 200, completedJobs: 500, responseRate: 1 },
      });
    }

    expect(await findMatchingProviders({ serviceId: service.id, zoneId: zone.id })).toEqual([]);
  });

  it('excludes a soft-deleted provider and a disabled user account', async () => {
    const service = await createService();
    const zone = await createZone();
    const deleted = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const disabled = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    await db.providerProfile.update({
      where: { id: deleted.provider.id },
      data: { deletedAt: new Date() },
    });
    await db.user.update({ where: { id: disabled.user.id }, data: { isActive: false } });

    expect(await findMatchingProviders({ serviceId: service.id, zoneId: zone.id })).toEqual([]);
  });

  it('excludes a provider who does not cover the zone', async () => {
    const service = await createService();
    const covered = await createZone();
    const elsewhere = await createZone();
    await createProvider({ serviceIds: [service.id], zoneIds: [elsewhere.id] });

    expect(await findMatchingProviders({ serviceId: service.id, zoneId: covered.id })).toEqual([]);
  });

  it('excludes a provider who does not offer the service', async () => {
    const wanted = await createService();
    const offered = await createService();
    const zone = await createZone();
    await createProvider({ serviceIds: [offered.id], zoneIds: [zone.id] });

    expect(await findMatchingProviders({ serviceId: wanted.id, zoneId: zone.id })).toEqual([]);
  });

  it('excludes a provider whose listing for the service is disabled', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await db.providerService.updateMany({
      where: { providerId: provider.id, serviceId: service.id },
      data: { isEnabled: false },
    });

    expect(await findMatchingProviders({ serviceId: service.id, zoneId: zone.id })).toEqual([]);
  });

  it('excludes a provider who is already at their own job ceiling', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const { provider } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      maxActiveJobs: 2,
    });

    await fill(provider.id, 1, service.id, customer.id);
    expect(await findMatchingProviders({ serviceId: service.id, zoneId: zone.id })).toHaveLength(1);

    await fill(provider.id, 1, service.id, customer.id);
    expect(await findMatchingProviders({ serviceId: service.id, zoneId: zone.id })).toEqual([]);
  });

  it('offers an emergency job only to providers who opted into emergencies', async () => {
    const service = await createService({ isEmergencyEnabled: true });
    const zone = await createZone();
    const normal = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const onCall = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      emergencyAvailable: true,
    });

    const matches = await findMatchingProviders({
      serviceId: service.id,
      zoneId: zone.id,
      urgency: 'EMERGENCY',
    });
    expect(matches.map((m) => m.providerId)).toEqual([onCall.provider.id]);
    expect(matches.map((m) => m.providerId)).not.toContain(normal.provider.id);
  });

  it('excludes a provider beyond the platform distance ceiling when the distance is known', async () => {
    const service = await createService();
    const zone = await createZone(); // 33.7, 73.05
    const near = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const far = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await setSettingValue('matching.maxDistanceKm', 20);

    await db.providerLocation.create({
      data: { providerId: near.provider.id, latitude: 33.71, longitude: 73.06 },
    });
    // Lahore, ~270 km away.
    await db.providerLocation.create({
      data: { providerId: far.provider.id, latitude: 31.52, longitude: 74.35 },
    });

    const matches = await findMatchingProviders({
      serviceId: service.id,
      zoneId: zone.id,
      location: { latitude: 33.7, longitude: 73.05 },
    });
    expect(matches.map((m) => m.providerId)).toEqual([near.provider.id]);
  });

  it('respects the provider own stated radius, not just the platform ceiling', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await setSettingValue('matching.maxDistanceKm', 40);
    await db.providerProfile.update({
      where: { id: provider.id },
      data: { serviceRadiusKm: 2 },
    });
    // ~11 km from the job: inside the platform ceiling, outside their radius.
    await db.providerLocation.create({
      data: { providerId: provider.id, latitude: 33.8, longitude: 73.05 },
    });

    expect(
      await findMatchingProviders({
        serviceId: service.id,
        zoneId: zone.id,
        location: { latitude: 33.7, longitude: 73.05 },
      }),
    ).toEqual([]);
  });

  it('does not exclude anybody on an estimated distance', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await setSettingValue('matching.maxDistanceKm', 1);
    // No provider GPS fix at all, so the distance is a guess. Guessing somebody
    // out of a job is worse than ranking them mid-list.
    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    expect(matches.map((m) => m.providerId)).toEqual([provider.id]);
    expect(matches[0]!.distanceIsEstimate).toBe(true);
  });
});

describe('matching soft scoring', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('matching.maxDistanceKm', 25);
    await setSettingValue('matching.newProviderRatingFloor', 4);
  });

  it('ranks the better-rated provider above the worse one, all else equal', async () => {
    const service = await createService();
    const zone = await createZone();
    const good = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const poor = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    await db.providerProfile.update({
      where: { id: good.provider.id },
      data: { ratingAverage: 4.9, ratingCount: 40 },
    });
    await db.providerProfile.update({
      where: { id: poor.provider.id },
      data: { ratingAverage: 2.5, ratingCount: 40 },
    });

    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    expect(matches.map((m) => m.providerId)).toEqual([good.provider.id, poor.provider.id]);
  });

  it('gives a brand-new provider the configured rating floor so they can win work', async () => {
    const service = await createService();
    const zone = await createZone();
    const fresh = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const mediocre = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await db.providerProfile.update({
      where: { id: mediocre.provider.id },
      data: { ratingAverage: 3, ratingCount: 50 },
    });

    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    // A 4.0 floor beats a real 3.0 average — deliberate, so the network can grow.
    expect(matches[0]!.providerId).toBe(fresh.provider.id);
  });

  it('does not punish a new provider for having no response history', async () => {
    const service = await createService();
    const zone = await createZone();
    await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    // offeredJobs is 0, so responseRate is scored neutrally rather than as zero.
    expect(matches[0]!.breakdown.responseRate).toBeGreaterThan(0);
  });

  it('prefers the lighter-loaded provider when everything else matches', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const busy = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      maxActiveJobs: 4,
    });
    const free = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      maxActiveJobs: 4,
    });
    await fill(busy.provider.id, 3, service.id, customer.id);

    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    expect(matches.map((m) => m.providerId)).toEqual([free.provider.id, busy.provider.id]);
    expect(matches[1]!.activeJobs).toBe(3);
  });

  it('scores a slot inside the working week above one outside it', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    const inHours = await findMatchingProviders({
      serviceId: service.id,
      zoneId: zone.id,
      scheduledFor: saturdayAfternoonPkt(),
    });
    // Sunday: the fixture provider does not work at all (windows are Mon–Sat).
    const sunday = new Date(Date.UTC(2026, 8, 13, 9, 0, 0));
    const outOfHours = await findMatchingProviders({
      serviceId: service.id,
      zoneId: zone.id,
      scheduledFor: sunday,
    });

    expect(inHours[0]!.providerId).toBe(provider.id);
    expect(inHours[0]!.breakdown.availability!).toBeGreaterThan(
      outOfHours[0]!.breakdown.availability!,
    );
  });

  it('treats an emergency as always available, schedule notwithstanding', async () => {
    const service = await createService({ isEmergencyEnabled: true });
    const zone = await createZone();
    await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      emergencyAvailable: true,
    });
    const sunday = new Date(Date.UTC(2026, 8, 13, 22, 0, 0)); // 03:00 PKT Monday

    const matches = await findMatchingProviders({
      serviceId: service.id,
      zoneId: zone.id,
      urgency: 'EMERGENCY',
      scheduledFor: sunday,
    });
    const weights = { availability: 20 };
    expect(matches[0]!.breakdown.availability).toBe(weights.availability);
  });

  it('is retunable from settings without a code change', async () => {
    const service = await createService();
    const zone = await createZone();
    const highRating = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const manyJobs = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await db.providerProfile.update({
      where: { id: highRating.provider.id },
      data: { ratingAverage: 5, ratingCount: 30, completedJobs: 0 },
    });
    await db.providerProfile.update({
      where: { id: manyJobs.provider.id },
      data: { ratingAverage: 3.2, ratingCount: 30, completedJobs: 400 },
    });

    await setSettingValue('matching.weights', {
      serviceMatch: 0,
      availability: 0,
      rating: 100,
      distance: 0,
      responseRate: 0,
      completedJobs: 0,
      workload: 0,
    });
    const byRating = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    expect(byRating[0]!.providerId).toBe(highRating.provider.id);

    await setSettingValue('matching.weights', {
      serviceMatch: 0,
      availability: 0,
      rating: 0,
      distance: 0,
      responseRate: 0,
      completedJobs: 100,
      workload: 0,
    });
    const byExperience = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    expect(byExperience[0]!.providerId).toBe(manyJobs.provider.id);
  });

  it('publishes a per-signal breakdown that adds up to the score', async () => {
    const service = await createService();
    const zone = await createZone();
    await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    const [match] = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    const summed = Object.values(match!.breakdown).reduce((total, part) => total + part, 0);
    // Both sides are rounded to 2dp independently, so allow for that.
    expect(Math.abs(summed - match!.score)).toBeLessThan(0.1);
  });

  it('honours the requested limit', async () => {
    const service = await createService();
    const zone = await createZone();
    for (let index = 0; index < 4; index += 1) {
      await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    }

    const matches = await findMatchingProviders({
      serviceId: service.id,
      zoneId: zone.id,
      limit: 2,
    });
    expect(matches).toHaveLength(2);
  });

  it('never leaks a provider phone number or GPS fix into a candidate', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await db.providerProfile.update({
      where: { id: provider.id },
      data: { contactPhone: '+923007776655' },
    });
    await db.providerLocation.create({
      data: { providerId: provider.id, latitude: 33.6844, longitude: 73.0155 },
    });

    const matches = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    const serialized = JSON.stringify(matches);
    expect(serialized).not.toContain('923007776655');
    expect(serialized).not.toContain('33.6844');
  });
});

describe('offers and response statistics', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function offerFixture() {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const address = await db.address.create({
      data: {
        userId: customer.id,
        zoneId: zone.id,
        addressLine: 'House 5, Street 5',
        isDefault: true,
      },
    });
    const booking = await db.booking.create({
      data: {
        reference: `IFX-O-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        status: 'PENDING',
        problemDescription: 'Needs a provider',
      },
    });
    return { service, zone, booking };
  }

  it('creates one offer per chosen provider and counts it against them', async () => {
    const { service, zone, booking } = await offerFixture();
    const first = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const second = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    const candidates = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    const offered = await createOffers({
      bookingId: booking.id,
      candidates,
      limit: 5,
      expiryMinutes: 30,
    });

    expect(offered).toHaveLength(2);
    const offers = await db.bookingOffer.findMany({ where: { bookingId: booking.id } });
    expect(offers).toHaveLength(2);
    expect(offers.every((offer) => offer.expiresAt !== null)).toBe(true);
    expect(offers.every((offer) => offer.score !== null)).toBe(true);

    for (const provider of [first.provider.id, second.provider.id]) {
      const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: provider } });
      expect(saved.offeredJobs).toBe(1);
    }
  });

  it('respects the fan-out limit instead of notifying everybody', async () => {
    const { service, zone, booking } = await offerFixture();
    for (let index = 0; index < 5; index += 1) {
      await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    }

    const candidates = await findMatchingProviders({ serviceId: service.id, zoneId: zone.id });
    const offered = await createOffers({
      bookingId: booking.id,
      candidates,
      limit: 2,
      expiryMinutes: 30,
    });
    expect(offered).toHaveLength(2);
    expect(await db.bookingOffer.count({ where: { bookingId: booking.id } })).toBe(2);
  });

  it('is a no-op when nothing matched', async () => {
    const { booking } = await offerFixture();
    const offered = await createOffers({
      bookingId: booking.id,
      candidates: [],
      limit: 5,
      expiryMinutes: 30,
    });
    expect(offered).toEqual([]);
    expect(await db.bookingOffer.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('records a response and recomputes the response rate from real history', async () => {
    const { service, zone, booking } = await offerFixture();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const second = await offerFixture();

    await createOffers({
      bookingId: booking.id,
      candidates: await findMatchingProviders({ serviceId: service.id, zoneId: zone.id }),
      limit: 5,
      expiryMinutes: 30,
    });
    await createOffers({
      bookingId: second.booking.id,
      candidates: await findMatchingProviders({ serviceId: service.id, zoneId: zone.id }),
      limit: 5,
      expiryMinutes: 30,
    });

    // Answer one of the two offers.
    await recordOfferResponse({ bookingId: booking.id, providerId: provider.id, accepted: true });

    const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: provider.id } });
    expect(saved.responseRate).toBeCloseTo(0.5, 5);
    expect(saved.acceptedJobs).toBe(1);
    expect(saved.avgResponseMinutes).not.toBeNull();

    const offer = await db.bookingOffer.findUniqueOrThrow({
      where: { bookingId_providerId: { bookingId: booking.id, providerId: provider.id } },
    });
    expect(offer.accepted).toBe(true);
    expect(offer.respondedAt).not.toBeNull();
  });

  it('keeps the first recorded response rather than overwriting it', async () => {
    const { service, zone, booking } = await offerFixture();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await createOffers({
      bookingId: booking.id,
      candidates: await findMatchingProviders({ serviceId: service.id, zoneId: zone.id }),
      limit: 5,
      expiryMinutes: 30,
    });

    await recordOfferResponse({
      bookingId: booking.id,
      providerId: provider.id,
      accepted: false,
      declineReason: 'too_far',
    });
    await recordOfferResponse({ bookingId: booking.id, providerId: provider.id, accepted: true });

    const offer = await db.bookingOffer.findUniqueOrThrow({
      where: { bookingId_providerId: { bookingId: booking.id, providerId: provider.id } },
    });
    // The decline stands: an already-answered offer is not re-answerable.
    expect(offer.accepted).toBe(false);
    expect(offer.declineReason).toBe('too_far');
  });

  it('survives a response for an offer that was never recorded', async () => {
    const { service, zone } = await offerFixture();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const orphan = await offerFixture();

    await expect(
      recordOfferResponse({
        bookingId: orphan.booking.id,
        providerId: provider.id,
        accepted: true,
      }),
    ).resolves.toBeUndefined();
  });
});
