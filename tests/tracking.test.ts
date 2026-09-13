import { beforeEach, describe, expect, it } from 'vitest';
import { createBooking } from '@/lib/bookings/service';
import { trackingFor } from '@/lib/bookings/tracking';
import { openCallChannel } from '@/lib/calling';
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

async function scenario() {
  const customer = await createUser({ role: 'CUSTOMER' });
  const service = await createService();
  const zone = await createZone();
  const { provider, user: providerUser } = await createProvider({
    serviceIds: [service.id],
    zoneIds: [zone.id],
  });
  const address = await createAddress(customer.id, zone.id);
  const { booking } = await createBooking({
    customerId: customer.id,
    serviceId: service.id,
    addressId: address.id,
    providerId: provider.id,
    problemDescription: 'The AC runs but no cold air comes out at all.',
    scheduledFor: tomorrowAt(),
  });
  return { customer, service, zone, provider, providerUser, address, booking };
}

/** Put the booking in a travelling state and give the provider a fresh fix. */
async function travelling(params: {
  bookingId: string;
  providerId: string;
  ageSeconds?: number;
  sharing?: boolean;
  /** ~1.1 km north of the fixture address. */
  latitude?: number;
  longitude?: number;
}) {
  await db.booking.update({ where: { id: params.bookingId }, data: { status: 'ON_THE_WAY' } });
  await db.providerProfile.update({
    where: { id: params.providerId },
    data: { shareLiveLocation: params.sharing ?? true },
  });
  if (params.sharing !== false) {
    await db.providerLocation.create({
      data: {
        providerId: params.providerId,
        latitude: params.latitude ?? 33.6944,
        longitude: params.longitude ?? 73.0155,
        recordedAt: new Date(Date.now() - (params.ageSeconds ?? 30) * 1000),
      },
    });
  }
}

describe('technician tracking', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('shows nothing before the technician sets off', async () => {
    const base = await scenario();
    const snapshot = await trackingFor({
      bookingId: base.booking.id,
      customerId: base.customer.id,
    });
    expect(snapshot.state).toBe('not_trackable');
    expect(snapshot.point).toBeNull();
  });

  it('reports a live position with a distance and a rough time', async () => {
    const base = await scenario();
    await travelling({ bookingId: base.booking.id, providerId: base.provider.id });

    const snapshot = await trackingFor({
      bookingId: base.booking.id,
      customerId: base.customer.id,
    });
    expect(snapshot.state).toBe('live');
    expect(snapshot.point).not.toBeNull();
    expect(snapshot.distanceKm).toBeGreaterThan(0);
    expect(snapshot.distanceKm).toBeLessThan(3);
    expect(snapshot.roughMinutesAway).toBeGreaterThan(0);
  });

  it('marks an old fix as stale rather than drawing it as current', async () => {
    const base = await scenario();
    await travelling({
      bookingId: base.booking.id,
      providerId: base.provider.id,
      ageSeconds: 20 * 60,
    });

    const snapshot = await trackingFor({
      bookingId: base.booking.id,
      customerId: base.customer.id,
    });
    expect(snapshot.state).toBe('stale');
    // The position is still returned — it is labelled, not hidden.
    expect(snapshot.point).not.toBeNull();
    expect(snapshot.message).toMatch(/approximate/i);
  });

  it('says plainly when the technician has sharing turned off', async () => {
    const base = await scenario();
    await travelling({
      bookingId: base.booking.id,
      providerId: base.provider.id,
      sharing: false,
    });

    const snapshot = await trackingFor({
      bookingId: base.booking.id,
      customerId: base.customer.id,
    });
    expect(snapshot.state).toBe('sharing_off');
    expect(snapshot.point).toBeNull();
  });

  it('distinguishes sharing-on-but-no-fix-yet from sharing-off', async () => {
    const base = await scenario();
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'ON_THE_WAY' } });
    await db.providerProfile.update({
      where: { id: base.provider.id },
      data: { shareLiveLocation: true },
    });

    const snapshot = await trackingFor({
      bookingId: base.booking.id,
      customerId: base.customer.id,
    });
    expect(snapshot.state).toBe('no_fix');
  });

  it('stops tracking once the job is done', async () => {
    const base = await scenario();
    await travelling({ bookingId: base.booking.id, providerId: base.provider.id });
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'COMPLETED' } });

    const snapshot = await trackingFor({
      bookingId: base.booking.id,
      customerId: base.customer.id,
    });
    expect(snapshot.state).toBe('not_trackable');
    expect(snapshot.point).toBeNull();
  });

  it('will not let one customer watch another customer’s technician', async () => {
    const base = await scenario();
    await travelling({ bookingId: base.booking.id, providerId: base.provider.id });
    const stranger = await createUser({ role: 'CUSTOMER' });

    await expect(
      trackingFor({ bookingId: base.booking.id, customerId: stranger.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('calling the other party', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('hands over the real number, labelled, when masking is not configured', async () => {
    const base = await scenario();
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'ACCEPTED' } });

    const channel = await openCallChannel({
      bookingId: base.booking.id,
      callerUserId: base.customer.id,
    });
    expect(channel.mode).toBe('direct');
    expect(channel.numberIsReal).toBe(true);
    expect(channel.note).toMatch(/not configured/i);
    expect(channel.dialNumber).toBe(base.provider.contactPhone);
  });

  it('lets the technician call the customer back', async () => {
    const base = await scenario();
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'ON_THE_WAY' } });

    const channel = await openCallChannel({
      bookingId: base.booking.id,
      callerUserId: base.providerUser.id,
    });
    expect(channel.counterpartName).toBe(
      (await db.user.findUniqueOrThrow({ where: { id: base.customer.id } })).fullName,
    );
  });

  it('shares nothing before the technician has accepted', async () => {
    const base = await scenario();
    await expect(
      openCallChannel({ bookingId: base.booking.id, callerUserId: base.customer.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('shares nothing once the booking is closed', async () => {
    const base = await scenario();
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'COMPLETED' } });
    await expect(
      openCallChannel({ bookingId: base.booking.id, callerUserId: base.customer.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('will not connect a stranger to either party', async () => {
    const base = await scenario();
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'ACCEPTED' } });
    const stranger = await createUser({ role: 'CUSTOMER' });

    await expect(
      openCallChannel({ bookingId: base.booking.id, callerUserId: stranger.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('records every channel it opens in the audit log', async () => {
    const base = await scenario();
    await db.booking.update({ where: { id: base.booking.id }, data: { status: 'ACCEPTED' } });
    await openCallChannel({ bookingId: base.booking.id, callerUserId: base.customer.id });

    const entry = await db.auditLog.findFirst({
      where: { action: 'booking.call_opened', entityId: base.booking.id },
    });
    expect(entry).not.toBeNull();
  });
});
