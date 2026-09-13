import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  approveProvider,
  reinstateProvider,
  rejectProvider,
  setVerification,
  suspendProvider,
  upsertProviderProfile,
} from '@/lib/providers/service';
import { getPublicProvider, listPublicProviders } from '@/lib/providers/visibility';
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
 * Provider onboarding, admin approval and the verification badges.
 *
 * These tests exist to hold two promises the product makes in writing:
 *  1. A self-registered provider cannot receive work or appear publicly until an
 *     admin has actually reviewed them.
 *  2. A badge is shown only when the check behind it was really completed — the
 *     platform never claims government verification, licensing or a background
 *     check it did not perform.
 */

async function onboardingInput(userId: string, serviceId: string, zoneId: string) {
  return {
    userId,
    businessName: 'Sharif Cooling Services',
    contactPhone: '+923005559999',
    yearsExperience: 8,
    services: [{ serviceId, startingPricePaisa: 200_000 }],
    zoneIds: [zoneId],
    availability: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1140 }],
    emergencyAvailable: false,
  };
}

describe('provider onboarding', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('refuses to build a provider profile on a customer account', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService();
    const zone = await createZone();

    await expect(
      upsertProviderProfile(await onboardingInput(customer.id, service.id, zone.id)),
    ).rejects.toThrow(/not a provider account/i);
  });

  it('lands a new provider in PENDING_VERIFICATION with no approved badges', async () => {
    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();

    const profile = await upsertProviderProfile(
      await onboardingInput(user.id, service.id, zone.id),
    );

    expect(profile.status).toBe('PENDING_VERIFICATION');
    expect(profile.verifiedAt).toBeNull();

    // The checklist is seeded, but nothing on it is approved: no check has run.
    const verifications = await db.providerVerification.findMany({
      where: { providerId: profile.id },
    });
    expect(verifications.length).toBeGreaterThan(0);
    expect(verifications.every((row) => row.status === 'NOT_SUBMITTED')).toBe(true);
  });

  it('never stores a raw IBAN — only a hash and the last four digits', async () => {
    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();

    const profile = await upsertProviderProfile({
      ...(await onboardingInput(user.id, service.id, zone.id)),
      bankAccountTitle: 'Sharif Cooling',
      bankName: 'Meezan',
      bankIban: 'PK36 SCBL 0000 0011 2345 6702',
    });

    const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(saved.bankAccountLast4).toBe('6702');
    expect(saved.bankIbanHash).toMatch(/^[0-9a-f]{64}$/);
    // The digits in the middle of the account number are gone for good.
    expect(JSON.stringify(saved)).not.toContain('0000001123456702');
  });

  it('is idempotent: re-submitting replaces the sets instead of duplicating them', async () => {
    const user = await createUser({ role: 'PROVIDER' });
    const first = await createService();
    const second = await createService();
    const zone = await createZone();

    const input = await onboardingInput(user.id, first.id, zone.id);
    const profile = await upsertProviderProfile(input);
    await upsertProviderProfile({
      ...input,
      services: [
        { serviceId: first.id, startingPricePaisa: 200_000 },
        { serviceId: second.id, startingPricePaisa: 300_000 },
      ],
    });

    const services = await db.providerService.findMany({ where: { providerId: profile.id } });
    expect(services).toHaveLength(2);
    const areas = await db.serviceArea.findMany({ where: { providerId: profile.id } });
    expect(areas).toHaveLength(1);
  });

  it('refuses a service or area that is not in the catalogue', async () => {
    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    await db.service.update({ where: { id: service.id }, data: { isActive: false } });

    await expect(
      upsertProviderProfile(await onboardingInput(user.id, service.id, zone.id)),
    ).rejects.toThrow(/selected services is unavailable/i);
  });

  it('caps the provider-set emergency fee at the platform maximum', async () => {
    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    await setSettingValue('emergency.maxFeePaisa', 100_000);

    await expect(
      upsertProviderProfile({
        ...(await onboardingInput(user.id, service.id, zone.id)),
        emergencyAvailable: true,
        emergencyFeePaisa: 500_000,
      }),
    ).rejects.toThrow(/platform maximum/i);
  });
});

describe('admin approval', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('providers.autoApprove', false);
    await setSettingValue('providers.requireCnicForVerification', false);
  });

  async function pendingProvider() {
    const admin = await createUser({ role: 'ADMIN' });
    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    const profile = await upsertProviderProfile(
      await onboardingInput(user.id, service.id, zone.id),
    );
    return { admin, user, service, zone, profile };
  }

  it('keeps an unverified provider out of the public directory', async () => {
    const { profile } = await pendingProvider();

    const listed = await listPublicProviders();
    expect(listed.items.map((row) => row.id)).not.toContain(profile.id);
    expect(await getPublicProvider(profile.slug)).toBeNull();
  });

  it('refuses a public booking for an unverified provider', async () => {
    const { profile, service, zone } = await pendingProvider();
    const customer = await createUser({ role: 'CUSTOMER' });
    const address = await createAddress(customer.id, zone.id);

    await expect(
      createBooking({
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        providerId: profile.id,
        problemDescription: 'Trying to book somebody who was never reviewed',
        scheduledFor: tomorrowAt(),
      }),
    ).rejects.toThrow();
  });

  it('makes the provider public and bookable once an admin approves', async () => {
    const { admin, profile, service, zone } = await pendingProvider();

    await approveProvider({
      providerId: profile.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      note: 'Documents reviewed',
    });

    const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(saved.status).toBe('VERIFIED');
    expect(saved.verifiedAt).not.toBeNull();

    const listed = await listPublicProviders();
    expect(listed.items.map((row) => row.id)).toContain(profile.id);

    const customer = await createUser({ role: 'CUSTOMER' });
    const address = await createAddress(customer.id, zone.id);
    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      providerId: profile.id,
      problemDescription: 'Now a real, reviewed provider',
      scheduledFor: tomorrowAt(),
    });
    expect(result.booking.providerId).toBe(profile.id);
  });

  it('claims only the onboarding review, not any external verification', async () => {
    const { admin, profile } = await pendingProvider();

    await approveProvider({ providerId: profile.id, actorUserId: admin.id, actorRole: 'ADMIN' });

    const approved = await db.providerVerification.findMany({
      where: { providerId: profile.id, status: 'APPROVED' },
      select: { kind: true },
    });
    // Approving onboarding approves exactly one badge. Identity, phone, email
    // and bank each need their own completed check.
    expect(approved.map((row) => row.kind)).toEqual(['PLATFORM_ONBOARDING']);

    const card = await getPublicProvider(profile.slug);
    expect(card?.badges.map((badge) => badge.kind)).toEqual(['PLATFORM_ONBOARDING']);
  });

  it('refuses to approve a provider who has no services or areas to offer', async () => {
    const { admin, profile } = await pendingProvider();
    await db.providerService.deleteMany({ where: { providerId: profile.id } });

    await expect(
      approveProvider({ providerId: profile.id, actorUserId: admin.id, actorRole: 'ADMIN' }),
    ).rejects.toThrow(/services and service areas/i);
  });

  it('refuses to approve without an identity document when the setting demands one', async () => {
    const { admin, profile } = await pendingProvider();
    await setSettingValue('providers.requireCnicForVerification', true);

    await expect(
      approveProvider({ providerId: profile.id, actorUserId: admin.id, actorRole: 'ADMIN' }),
    ).rejects.toThrow(/identity document/i);

    // Submitting the document unblocks the same call.
    await setVerification({
      providerId: profile.id,
      kind: 'IDENTITY_CNIC',
      status: 'SUBMITTED',
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    const saved = await approveProvider({
      providerId: profile.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    expect(saved.status).toBe('VERIFIED');
  });

  it('does not auto-approve while a CNIC document is required', async () => {
    await setSettingValue('providers.autoApprove', true);
    await setSettingValue('providers.requireCnicForVerification', true);

    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    const profile = await upsertProviderProfile(
      await onboardingInput(user.id, service.id, zone.id),
    );

    const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(saved.status).toBe('PENDING_VERIFICATION');
  });

  it('auto-approves only when the setting is on and no document is required', async () => {
    await setSettingValue('providers.autoApprove', true);
    await setSettingValue('providers.requireCnicForVerification', false);

    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    const profile = await upsertProviderProfile(
      await onboardingInput(user.id, service.id, zone.id),
    );

    const saved = await db.providerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(saved.status).toBe('VERIFIED');
  });

  it('refuses to approve the same provider twice', async () => {
    const { admin, profile } = await pendingProvider();
    await approveProvider({ providerId: profile.id, actorUserId: admin.id, actorRole: 'ADMIN' });

    await expect(
      approveProvider({ providerId: profile.id, actorUserId: admin.id, actorRole: 'ADMIN' }),
    ).rejects.toThrow(/already verified/i);
  });

  it('records who approved the provider in the audit log', async () => {
    const { admin, profile } = await pendingProvider();
    await approveProvider({
      providerId: profile.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      note: 'CNIC and utility bill seen',
    });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: 'ProviderProfile', entityId: profile.id, action: 'provider.approved' },
    });
    expect(entry.actorUserId).toBe(admin.id);
  });

  it('rejects a provider with a recorded reason and keeps them invisible', async () => {
    const { admin, profile } = await pendingProvider();

    const saved = await rejectProvider({
      providerId: profile.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      reason: 'Documents did not match the application',
    });

    expect(saved.status).toBe('REJECTED');
    expect(saved.rejectedReason).toBe('Documents did not match the application');
    const listed = await listPublicProviders();
    expect(listed.items.map((row) => row.id)).not.toContain(profile.id);
  });
});

describe('suspension', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('withdraws pending offers and hides a suspended provider', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const customer = await createUser({ role: 'CUSTOMER' });
    const address = await createAddress(customer.id, zone.id);

    const booking = await db.booking.create({
      data: {
        reference: 'IFX-SUSP01',
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        status: 'PROVIDER_NOTIFIED',
        problemDescription: 'Awaiting a provider response',
      },
    });
    await db.bookingOffer.create({
      data: { bookingId: booking.id, providerId: provider.id, score: 0.8 },
    });

    await suspendProvider({
      providerId: provider.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      reason: 'Repeated no-shows',
    });

    const offer = await db.bookingOffer.findFirstOrThrow({ where: { providerId: provider.id } });
    expect(offer.respondedAt).not.toBeNull();
    expect(offer.accepted).toBe(false);
    expect(offer.declineReason).toBe('provider_suspended');

    const listed = await listPublicProviders();
    expect(listed.items.map((row) => row.id)).not.toContain(provider.id);
  });

  it('revokes every session so a suspended provider cannot keep working', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const service = await createService();
    const zone = await createZone();
    const { provider, user } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
    });
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'a'.repeat(64),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await suspendProvider({
      providerId: provider.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      reason: 'Under investigation',
    });

    const live = await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(live).toBe(0);
  });

  it('returns a previously verified provider to VERIFIED, and an unreviewed one to the queue', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const service = await createService();
    const zone = await createZone();

    const verified = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await suspendProvider({
      providerId: verified.provider.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      reason: 'Temporary hold',
    });
    const reinstated = await reinstateProvider({
      providerId: verified.provider.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    expect(reinstated.status).toBe('VERIFIED');

    const never = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
      status: 'PENDING_VERIFICATION',
    });
    await suspendProvider({
      providerId: never.provider.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      reason: 'Suspicious application',
    });
    const backToQueue = await reinstateProvider({
      providerId: never.provider.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    // Reinstatement must not be a back door into VERIFIED without a review.
    expect(backToQueue.status).toBe('PENDING_VERIFICATION');
  });

  it('refuses to reinstate a provider who is not suspended', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    await expect(
      reinstateProvider({ providerId: provider.id, actorUserId: admin.id, actorRole: 'ADMIN' }),
    ).rejects.toThrow(/only a suspended provider/i);
  });
});

describe('public provider projection', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('never exposes a phone number, address, bank detail or GPS position', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    await db.providerProfile.update({
      where: { id: provider.id },
      data: {
        contactPhone: '+923009998877',
        addressLine: 'House 12, Street 3, G-10/4',
        bankAccountLast4: '6702',
        bankIbanHash: 'f'.repeat(64),
      },
    });
    await db.providerLocation.create({
      data: { providerId: provider.id, latitude: 33.6844, longitude: 73.0155 },
    });

    const card = await getPublicProvider(provider.slug);
    const serialized = JSON.stringify(card);

    expect(serialized).not.toContain('923009998877');
    expect(serialized).not.toContain('Street 3');
    expect(serialized).not.toContain('6702');
    expect(serialized).not.toContain('33.6844');
  });

  it('shows a badge only for an approved verification', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    await setVerification({
      providerId: provider.id,
      kind: 'PHONE',
      status: 'SUBMITTED',
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    let card = await getPublicProvider(provider.slug);
    expect(card?.badges).toEqual([]);

    await setVerification({
      providerId: provider.id,
      kind: 'PHONE',
      status: 'APPROVED',
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    card = await getPublicProvider(provider.slug);
    expect(card?.badges.map((badge) => badge.kind)).toEqual(['PHONE']);
  });
});
