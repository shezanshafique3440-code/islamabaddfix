import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/lib/errors';
import { closeAccount, closureBlockers, exportAccountData } from '@/lib/account';
import {
  getNotificationPreferences,
  notify,
  setNotificationPreferences,
} from '@/lib/notifications';
import { loginUser } from '@/lib/auth/service';
import { createBooking } from '@/lib/bookings/service';
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

/**
 * Account rights and delivery preferences.
 *
 * The privacy policy tells people they can see their data and close their
 * account. These tests are what keeps that from being a claim the product
 * cannot honour.
 */

const PASSWORD = 'TestPass!2024';
const meta = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

describe('notification preferences', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('notifications.channels', {
      inApp: true,
      email: true,
      sms: true,
      whatsapp: true,
      push: true,
    });
  });

  it('defaults to transactional on and marketing off', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    const prefs = await getNotificationPreferences(user.id);

    expect(prefs).toEqual({
      email: true,
      sms: true,
      whatsapp: true,
      push: true,
      // Marketing is the one thing somebody has to ask for.
      marketing: false,
    });
  });

  it('stops sending on a channel the user switched off', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    await setNotificationPreferences(user.id, { email: false, sms: false });

    await notify({
      event: 'booking.created',
      userId: user.id,
      title: 'Booking aayi',
      body: 'Test',
    });

    const channels = await db.notification.findMany({
      where: { userId: user.id },
      select: { channel: true },
    });
    expect(channels.map((row) => row.channel)).not.toContain('EMAIL');
    expect(channels.map((row) => row.channel)).not.toContain('SMS');
  });

  it('always keeps in-app on, whatever the preferences say', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    await setNotificationPreferences(user.id, {
      email: false,
      sms: false,
      whatsapp: false,
      push: false,
    });

    await notify({
      event: 'booking.on_the_way',
      userId: user.id,
      title: 'Technician raste mein hai',
      body: 'Test',
    });

    // A product that can silently stop telling somebody a stranger is on the
    // way to their house is worse than one with no preferences at all.
    const inApp = await db.notification.count({ where: { userId: user.id, channel: 'IN_APP' } });
    expect(inApp).toBe(1);
  });

  it('delivers security messages even to a user who turned email off', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    await setNotificationPreferences(user.id, { email: false });

    await notify({
      event: 'auth.password_changed',
      userId: user.id,
      title: 'Password badal diya gaya',
      body: 'Test',
    });

    // "Stop telling me about bookings" is not "let somebody change my password
    // quietly".
    const email = await db.notification.count({ where: { userId: user.id, channel: 'EMAIL' } });
    expect(email).toBe(1);
  });
});

describe('data export', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  it('includes the account, bookings and quotes', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER', fullName: 'Ayesha Khan' });
    const address = await createAddress(customer.id, zone.id);
    await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'AC thandi hawa nahi de raha',
      scheduledFor: tomorrowAt(),
    });

    const data = await exportAccountData(customer.id);
    const serialized = JSON.stringify(data);

    expect(serialized).toContain('Ayesha Khan');
    expect(serialized).toContain('AC thandi hawa nahi de raha');
    expect((data.bookings as unknown[]).length).toBe(1);
  });

  it('never includes the password hash', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const row = await db.user.findUniqueOrThrow({ where: { id: customer.id } });

    const data = await exportAccountData(customer.id);

    expect(JSON.stringify(data)).not.toContain(row.passwordHash);
    expect(JSON.stringify(data)).not.toContain('passwordHash');
  });

  it('never includes another customer data', async () => {
    const service = await createService();
    const zone = await createZone();
    const mine = await createUser({ role: 'CUSTOMER' });
    const theirs = await createUser({ role: 'CUSTOMER', fullName: 'Somebody Else' });
    const theirAddress = await createAddress(theirs.id, zone.id);
    await createBooking({
      customerId: theirs.id,
      serviceId: service.id,
      addressId: theirAddress.id,
      problemDescription: 'Private problem of another person',
      scheduledFor: tomorrowAt(),
    });

    const data = await exportAccountData(mine.id);
    const serialized = JSON.stringify(data);

    expect(serialized).not.toContain('Somebody Else');
    expect(serialized).not.toContain('Private problem of another person');
  });

  it('records that the export happened', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    await exportAccountData(customer.id);

    const entry = await db.auditLog.findFirst({
      where: { entity: 'User', entityId: customer.id, action: 'user.data_exported' },
    });
    expect(entry).not.toBeNull();
  });

  it('lists file names but not file contents', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    await db.uploadedFile.create({
      data: {
        storageKey: 'secret/path/to/object',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'ac-unit.jpg',
        checksumSha256: 'a'.repeat(64),
        ownerId: customer.id,
      },
    });

    const data = await exportAccountData(customer.id);
    const serialized = JSON.stringify(data);

    expect(serialized).toContain('ac-unit.jpg');
    // The storage key is an internal locator, not the customer's data.
    expect(serialized).not.toContain('secret/path/to/object');
  });
});

describe('account closure', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  async function customerWithHistory() {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER', email: 'closing@test.local' });
    const address = await createAddress(customer.id, zone.id);
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const { booking } = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'A job that finished long ago',
      scheduledFor: tomorrowAt(),
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { status: 'COMPLETED', providerId: provider.id, finalTotalPaisa: 330_000 },
    });
    await db.payment.create({
      data: {
        bookingId: booking.id,
        method: 'CASH',
        status: 'PAID',
        amountPaisa: 330_000,
        paidAt: new Date(),
      },
    });
    return { customer, booking, address, provider };
  }

  it('removes the identifying data but keeps the booking record', async () => {
    const { customer, booking } = await customerWithHistory();

    await closeAccount({ userId: customer.id, password: PASSWORD });

    const saved = await db.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(saved.deletedAt).not.toBeNull();
    expect(saved.isActive).toBe(false);
    expect(saved.fullName).toBe('Deleted user');
    expect(saved.phone).toBeNull();
    expect(saved.email).toMatch(/^deleted-.*@deleted\.invalid$/);

    // The other party to the transaction has their own claim on this history,
    // and the accounts have to balance.
    const keptBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(keptBooking.finalTotalPaisa).toBe(330_000);
    expect(await db.payment.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it('hides the addresses and uploaded media', async () => {
    const { customer, address, booking } = await customerWithHistory();
    await db.uploadedFile.create({
      data: {
        storageKey: 'k1',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        originalName: 'my-kitchen.jpg',
        checksumSha256: 'c'.repeat(64),
        ownerId: customer.id,
        bookingId: booking.id,
      },
    });

    await closeAccount({ userId: customer.id, password: PASSWORD });

    const savedAddress = await db.address.findUniqueOrThrow({ where: { id: address.id } });
    expect(savedAddress.deletedAt).not.toBeNull();
    expect(await db.uploadedFile.count({ where: { ownerId: customer.id, deletedAt: null } })).toBe(
      0,
    );
  });

  it('revokes every session', async () => {
    const { customer } = await customerWithHistory();
    await loginUser({ email: 'closing@test.local', password: PASSWORD }, meta);

    await closeAccount({ userId: customer.id, password: PASSWORD });

    expect(await db.refreshToken.count({ where: { userId: customer.id, revokedAt: null } })).toBe(
      0,
    );
  });

  it('requires the correct password', async () => {
    const { customer } = await customerWithHistory();

    const failure = await closeAccount({
      userId: customer.id,
      password: 'not-the-password',
    }).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('INVALID_CREDENTIALS');
    const saved = await db.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(saved.deletedAt).toBeNull();
  });

  it('refuses while a booking is still live', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const address = await createAddress(customer.id, zone.id);
    await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'A job that is still going on right now',
      scheduledFor: tomorrowAt(),
    });

    const blockers = await closureBlockers(customer.id);
    expect(blockers.join(' ')).toMatch(/still under way/i);
    await expect(closeAccount({ userId: customer.id, password: PASSWORD })).rejects.toThrow(
      /still under way/i,
    );
  });

  it('refuses while a finished job is still unpaid', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const address = await createAddress(customer.id, zone.id);
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const { booking } = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Finished but nobody has paid for it',
      scheduledFor: tomorrowAt(),
    });
    // A CHECK constraint requires a provider on a completed booking — a job
    // nobody did cannot be finished.
    await db.booking.update({
      where: { id: booking.id },
      data: { status: 'COMPLETED', providerId: provider.id, finalTotalPaisa: 200_000 },
    });

    await expect(closeAccount({ userId: customer.id, password: PASSWORD })).rejects.toThrow(
      /not been paid/i,
    );
  });

  it('refuses for a staff account, which needs another admin', async () => {
    const admin = await createUser({ role: 'ADMIN' });

    const failure = await closeAccount({ userId: admin.id, password: PASSWORD }).catch(
      (error: AppError) => error,
    );
    // An administrator closing their own account could lock everybody out.
    expect((failure as AppError).code).toBe('FORBIDDEN');
  });

  it('suspends the provider profile and clears their bank details', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider, user } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
    });
    await db.providerProfile.update({
      where: { id: provider.id },
      data: {
        bankIbanHash: 'f'.repeat(64),
        bankAccountLast4: '6702',
        contactPhone: '+923001112233',
      },
    });

    await closeAccount({ userId: user.id, password: PASSWORD });

    const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: provider.id } });
    expect(saved.status).toBe('SUSPENDED');
    expect(saved.deletedAt).not.toBeNull();
    expect(saved.bankIbanHash).toBeNull();
    expect(saved.bankAccountLast4).toBeNull();
  });

  it('records the closure in the audit log', async () => {
    const { customer } = await customerWithHistory();
    await closeAccount({
      userId: customer.id,
      password: PASSWORD,
      reason: 'Shehr chhor raha hoon',
    });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: 'User', entityId: customer.id, action: 'user.account_deleted' },
    });
    expect((entry.metadata as { reason: string }).reason).toBe('Shehr chhor raha hoon');
  });

  it('leaves a closed account unable to sign in', async () => {
    const { customer } = await customerWithHistory();
    await closeAccount({ userId: customer.id, password: PASSWORD });
    void customer;

    await expect(
      loginUser({ email: 'closing@test.local', password: PASSWORD }, meta),
    ).rejects.toThrow();
  });
});
