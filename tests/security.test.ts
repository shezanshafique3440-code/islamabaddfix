import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/lib/errors';
import { jsonLdScript } from '@/lib/seo';
import { toSafeUser } from '@/lib/auth/service';
import { getBookingDetailFor } from '@/lib/bookings/queries';
import { upsertProviderProfile } from '@/lib/providers/service';
import { getPublicProvider } from '@/lib/providers/visibility';
import { createBooking } from '@/lib/bookings/service';
import { submitQuote, approveQuote, completeBooking } from '@/lib/bookings/quotes';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { can } from '@/lib/auth/rbac';
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
 * Security regressions.
 *
 * Each test here corresponds to a specific way this product could betray
 * somebody: leaking a customer's address to a technician who has not taken the
 * job, letting a client dictate what the platform earns, letting a provider's
 * business name become a script tag on their own public page, or letting one
 * customer read another's booking. They are separated from the feature tests
 * because they must keep passing regardless of how the features change.
 */

async function context(user: { id: string }, role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN', providerId?: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return { user: toSafeUser(row), role, providerId } as Parameters<typeof getBookingDetailFor>[1];
}

describe('structured data escaping', () => {
  it('cannot be broken out of with a crafted business name', () => {
    const hostile = '</script><script>alert(document.cookie)</script>';
    const serialized = jsonLdScript({ '@type': 'LocalBusiness', name: hostile });

    // No literal tag delimiter survives, so the script block cannot end early.
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).toContain('\\u003c');
    // And the data is unchanged: a consumer parsing the JSON sees the original.
    expect(JSON.parse(serialized).name).toBe(hostile);
  });

  it('escapes the ampersand and the line separators too', () => {
    const serialized = jsonLdScript({ name: 'A & B C' });
    expect(serialized).not.toContain('&');
    expect(serialized).not.toContain(' ');
    expect(JSON.parse(serialized).name).toBe('A & B C');
  });

  it('survives a hostile name stored through real onboarding', async () => {
    await truncateAll();
    await setSettingValue('providers.autoApprove', true);
    await setSettingValue('providers.requireCnicForVerification', false);

    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    const profile = await upsertProviderProfile({
      userId: user.id,
      businessName: '</script><script>alert(1)</script> Cooling',
      contactPhone: '+923005559999',
      yearsExperience: 3,
      services: [{ serviceId: service.id, startingPricePaisa: 200_000 }],
      zoneIds: [zone.id],
      availability: [],
      emergencyAvailable: false,
    });

    const card = await getPublicProvider(profile.slug);
    const serialized = jsonLdScript({ name: card?.businessName });
    expect(serialized).not.toContain('</script>');
  });
});

describe('booking visibility', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  async function scenario() {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const stranger = await createUser({ role: 'CUSTOMER' });
    const admin = await createUser({ role: 'ADMIN' });
    const assigned = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const other = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const address = await createAddress(customer.id, zone.id);
    await db.address.update({
      where: { id: address.id },
      data: {
        addressLine: 'House 42, Street 9, G-10/4',
        latitude: 33.6844,
        longitude: 73.0155,
        contactPhone: '+923009998877',
      },
    });
    await db.user.update({ where: { id: customer.id }, data: { phone: '+923001112233' } });

    const { booking } = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      providerId: assigned.provider.id,
      problemDescription: 'AC not cooling',
      scheduledFor: tomorrowAt(),
    });

    return { service, zone, customer, stranger, admin, assigned, other, address, booking };
  }

  it('refuses a booking to a customer who has nothing to do with it', async () => {
    const { stranger, booking } = await scenario();

    const failure = await getBookingDetailFor(
      booking.id,
      await context(stranger, 'CUSTOMER'),
    ).catch((error: AppError) => error);

    // 404, not 403: confirming the booking exists is itself a leak.
    expect((failure as AppError).code).toBe('NOT_FOUND');
  });

  it('refuses a booking to a provider who was never offered it', async () => {
    const { other, booking } = await scenario();

    const failure = await getBookingDetailFor(
      booking.id,
      await context(other.user, 'PROVIDER', other.provider.id),
    ).catch((error: AppError) => error);

    expect((failure as AppError).code).toBe('NOT_FOUND');
  });

  it('shows an offered provider the area only — no street, no coordinates, no phone', async () => {
    const { other, booking } = await scenario();
    await db.bookingOffer.create({
      data: { bookingId: booking.id, providerId: other.provider.id },
    });

    const detail = await getBookingDetailFor(
      booking.id,
      await context(other.user, 'PROVIDER', other.provider.id),
    );

    expect(detail.address.addressLine).toBeNull();
    expect(detail.address.latitude).toBeNull();
    expect(detail.address.contactPhone).toBeNull();
    // The zone is enough to decide whether to take the job.
    expect(detail.address.zone).not.toBeNull();

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('Street 9');
    expect(serialized).not.toContain('33.6844');
    expect(serialized).not.toContain('923009998877');
    // The customer's own number is masked, not sent and hidden in the UI.
    expect(serialized).not.toContain('923001112233');
  });

  it('releases the address once the provider is actually assigned', async () => {
    const { assigned, booking } = await scenario();

    const detail = await getBookingDetailFor(
      booking.id,
      await context(assigned.user, 'PROVIDER', assigned.provider.id),
    );

    expect(detail.address.addressLine).toContain('Street 9');
    expect(detail.customer.phone).toBe('+923001112233');
  });

  it('never shows the platform commission to a customer or a provider', async () => {
    const { customer, assigned, admin, booking } = await scenario();

    const forCustomer = await getBookingDetailFor(booking.id, await context(customer, 'CUSTOMER'));
    expect(forCustomer.pricing.commissionPaisa).toBeUndefined();
    expect(forCustomer.pricing.commissionRateBp).toBeUndefined();

    const forProvider = await getBookingDetailFor(
      booking.id,
      await context(assigned.user, 'PROVIDER', assigned.provider.id),
    );
    expect(forProvider.pricing.commissionPaisa).toBeUndefined();

    const forAdmin = await getBookingDetailFor(booking.id, await context(admin, 'ADMIN'));
    expect(forAdmin.pricing).toHaveProperty('commissionPaisa');
  });

  it('never puts a customer email in front of a provider', async () => {
    const { assigned, booking } = await scenario();

    const detail = await getBookingDetailFor(
      booking.id,
      await context(assigned.user, 'PROVIDER', assigned.provider.id),
    );
    expect(detail.customer.email).toBeUndefined();
  });
});

describe('money is decided server-side', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  it('ignores any total a client tries to attach to a quote', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
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
      problemDescription: 'AC not cooling',
      scheduledFor: tomorrowAt(),
    });
    await db.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });

    const quote = await submitQuote({
      bookingId: booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
      // A client that sends a total, a commission, or a discount alongside the
      // items is sending fields that do not exist — the sum is computed here.
      items: [
        { kind: 'LABOUR', label: 'Labour', unitPricePaisa: 200_000 },
        { kind: 'PARTS', label: 'Parts', unitPricePaisa: 100_000 },
      ],
      // A client that sends a total anyway is sending a field that does not
      // exist on the input type, so it cannot be read even accidentally. The
      // cast is what a hostile caller effectively does over the wire.
      ...({ subtotalPaisa: 1, commissionPaisa: 0, totalPaisa: 1 } as object),
    } as Parameters<typeof submitQuote>[0]);

    expect(quote.subtotalPaisa).toBe(300_000);
  });

  it('freezes the commission from the platform setting, not from anything sent in', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
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
      problemDescription: 'AC not cooling',
      scheduledFor: tomorrowAt(),
    });
    await db.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });

    const quote = await submitQuote({
      bookingId: booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 300_000 }],
    });
    await approveQuote({ quoteId: quote.id, customerUserId: customer.id });
    for (const to of ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS'] as const) {
      await db.booking.update({ where: { id: booking.id }, data: { status: to } });
    }
    await completeBooking({
      bookingId: booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });

    const completed = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(completed.commissionRateBp).toBe(1000);
    expect(completed.commissionPaisa).toBe(30_000);
    expect(completed.providerEarningsPaisa).toBe(270_000);
    // Gross is conserved: nothing is invented or lost in the split.
    expect(completed.commissionPaisa! + completed.providerEarningsPaisa!).toBe(
      completed.finalTotalPaisa,
    );
  });

  it('keeps a later rate change away from an already-completed booking', async () => {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
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
      problemDescription: 'AC not cooling',
      scheduledFor: tomorrowAt(),
    });
    await db.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });
    const quote = await submitQuote({
      bookingId: booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
      items: [{ kind: 'LABOUR', label: 'Labour', unitPricePaisa: 300_000 }],
    });
    await approveQuote({ quoteId: quote.id, customerUserId: customer.id });
    await db.booking.update({ where: { id: booking.id }, data: { status: 'IN_PROGRESS' } });
    await completeBooking({
      bookingId: booking.id,
      providerId: provider.id,
      actorUserId: providerUser.id,
    });

    // Raising the platform rate afterwards must not reach back and take more
    // from work that is already done.
    await setSettingValue('platform.commissionRateBp', 3000);

    const completed = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(completed.commissionRateBp).toBe(1000);
    expect(completed.commissionPaisa).toBe(30_000);
  });
});

describe('credentials and permissions', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('never lets a password hash into the user projection', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(row.passwordHash).toBeTruthy();
    const safe = toSafeUser(row);
    expect(Object.keys(safe)).not.toContain('passwordHash');
    expect(JSON.stringify(safe)).not.toContain(row.passwordHash);
  });

  it('stores a password only as a bcrypt hash', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(row.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(row.passwordHash).not.toContain('TestPass!2024');
  });

  it('keeps financial settings and role changes to SUPER_ADMIN', () => {
    // An ordinary admin runs operations; changing what the platform earns, or
    // who is an admin, is a different level of trust.
    expect(can('ADMIN', 'settings:write:financial')).toBe(false);
    expect(can('SUPER_ADMIN', 'settings:write:financial')).toBe(true);
    expect(can('ADMIN', 'user:role:write')).toBe(false);
    expect(can('SUPER_ADMIN', 'user:role:write')).toBe(true);
    // And a customer or provider has neither, whatever the frontend claims.
    expect(can('CUSTOMER', 'settings:write:financial')).toBe(false);
    expect(can('PROVIDER', 'booking:read:any')).toBe(false);
  });

  it('actually stops a caller once the rate limit is spent', async () => {
    const identity = `test:${randomUUID()}`;
    const rule = { name: 'test:rule', limit: 3, windowSeconds: 60 };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await checkRateLimit(rule, identity)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(rule, identity);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    // Someone else's budget is untouched.
    expect((await checkRateLimit(rule, `test:${randomUUID()}`)).allowed).toBe(true);
  });

  it('guards the password-change endpoint, not just login', () => {
    // Changing a password requires the current one, so it is a guessing surface
    // for a stolen session.
    expect(RATE_LIMITS.passwordChange.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.passwordChange.windowSeconds).toBeGreaterThanOrEqual(300);
  });
});
