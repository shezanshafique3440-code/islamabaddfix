import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { invalidateSettingsCache } from '@/lib/settings';

/**
 * Test fixtures.
 *
 * These build real rows through Prisma rather than mocking the database: the
 * behaviour under test — state transitions, commission, constraints — lives
 * partly in Postgres, so mocking it out would test nothing.
 */
const url =
  process.env.TEST_DATABASE_URL ??
  'postgresql://isbfix:isbfix@localhost:5432/isbfix_test?schema=public';

export const db = new PrismaClient({ datasources: { db: { url } } });

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`;

export async function createUser(
  overrides: { role?: Role; email?: string; fullName?: string; phone?: string } = {},
) {
  const id = unique();
  const user = await db.user.create({
    data: {
      email: overrides.email ?? `user-${id}@test.local`,
      phone: overrides.phone ?? `+9230000${id.slice(-5)}`,
      passwordHash: await bcrypt.hash('TestPass!2024', 4),
      fullName: overrides.fullName ?? `Test User ${id}`,
      role: overrides.role ?? 'CUSTOMER',
      emailVerifiedAt: new Date(),
    },
  });
  if ((overrides.role ?? 'CUSTOMER') === 'CUSTOMER') {
    await db.customerProfile.create({ data: { userId: user.id } });
  }
  return user;
}

export async function createZone(name = `Z-${unique()}`) {
  return db.serviceZone.create({
    data: { name, slug: `zone-${unique()}`, city: 'Islamabad', latitude: 33.7, longitude: 73.05 },
  });
}

export async function createService(
  overrides: {
    name?: string;
    minPricePaisa?: number;
    requiresInspection?: boolean;
    isEmergencyEnabled?: boolean;
    guaranteeEligible?: boolean;
  } = {},
) {
  const id = unique();
  const category = await db.serviceCategory.create({
    data: { name: `Category ${id}`, slug: `cat-${id}`, iconKey: 'wrench' },
  });
  return db.service.create({
    data: {
      categoryId: category.id,
      name: overrides.name ?? `Service ${id}`,
      slug: `svc-${id}`,
      minPricePaisa: overrides.minPricePaisa ?? 150_000,
      maxPricePaisa: 800_000,
      requiresInspection: overrides.requiresInspection ?? true,
      isEmergencyEnabled: overrides.isEmergencyEnabled ?? false,
      guaranteeEligible: overrides.guaranteeEligible ?? true,
      estimatedMinutes: 90,
    },
  });
}

export async function createProvider(options: {
  serviceIds: string[];
  zoneIds: string[];
  status?: 'PENDING_VERIFICATION' | 'VERIFIED' | 'SUSPENDED' | 'REJECTED';
  emergencyAvailable?: boolean;
  maxActiveJobs?: number;
}) {
  const user = await createUser({ role: 'PROVIDER' });
  const id = unique();
  const provider = await db.providerProfile.create({
    data: {
      userId: user.id,
      businessName: `Provider ${id}`,
      slug: `provider-${id}`,
      status: options.status ?? 'VERIFIED',
      contactPhone: user.phone ?? '+923000000000',
      yearsExperience: 5,
      emergencyAvailable: options.emergencyAvailable ?? false,
      emergencyFeePaisa: options.emergencyAvailable ? 80_000 : 0,
      maxActiveJobs: options.maxActiveJobs ?? 5,
      verifiedAt: (options.status ?? 'VERIFIED') === 'VERIFIED' ? new Date() : null,
    },
  });

  await db.providerService.createMany({
    data: options.serviceIds.map((serviceId) => ({
      providerId: provider.id,
      serviceId,
      startingPricePaisa: 150_000,
    })),
  });
  await db.serviceArea.createMany({
    data: options.zoneIds.map((zoneId) => ({ providerId: provider.id, zoneId })),
  });
  // Mon–Sat, 09:00–19:00, so availability scoring has something to work with.
  await db.providerAvailability.createMany({
    data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      providerId: provider.id,
      dayOfWeek,
      startMinute: 540,
      endMinute: 1140,
    })),
  });

  return { provider, user };
}

export async function createAddress(userId: string, zoneId: string | null) {
  // Only the user's first address is the default one: a partial unique index
  // enforces one default per user, so a fixture that adds a second address must
  // not claim the flag again.
  const existing = await db.address.count({ where: { userId, deletedAt: null } });
  return db.address.create({
    data: {
      userId,
      label: existing === 0 ? 'Home' : `Address ${existing + 1}`,
      zoneId,
      city: 'Islamabad',
      addressLine: `House ${unique()}, Street 4, Islamabad`,
      contactPhone: '+923001234567',
      isDefault: existing === 0,
      latitude: 33.6844,
      longitude: 73.0155,
    },
  });
}

/** A slot comfortably inside the default lead-time window. */
export function tomorrowAt(hour = 17): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/**
 * Write a platform setting for the test that follows.
 *
 * The settings module caches values in-process for a short TTL, so a write that
 * bypasses `setSetting` must drop that cache explicitly — otherwise the code
 * under test keeps reading the previous value (or the default) and the test
 * silently exercises the wrong configuration.
 */
export async function setSettingValue(key: string, value: unknown): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  invalidateSettingsCache();
}

/**
 * An active membership with real benefits, ready to be applied to a booking.
 *
 * Mirrors what `purchaseMembership` + `confirmMembershipPayment` would produce:
 * benefits are snapshotted onto the membership row, not read back off the plan.
 */
export async function createMembership(options: {
  userId: string;
  discountBp?: number;
  maxDiscountPaisa?: number | null;
  guaranteeBonusDays?: number;
  priorityFanoutBonus?: number;
  emergencyFeeWaiverPaisa?: number;
  status?: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  startsAt?: Date;
  endsAt?: Date;
}) {
  const id = unique();
  const plan = await db.membershipPlan.create({
    data: {
      code: `plan-${id}`,
      name: `Plan ${id}`,
      description: 'Test plan with real benefits.',
      pricePaisa: 500_000,
      periodDays: 365,
      discountBp: options.discountBp ?? 1000,
      maxDiscountPaisa: options.maxDiscountPaisa ?? null,
      guaranteeBonusDays: options.guaranteeBonusDays ?? 0,
      priorityFanoutBonus: options.priorityFanoutBonus ?? 0,
      emergencyFeeWaiverPaisa: options.emergencyFeeWaiverPaisa ?? 0,
    },
  });
  const now = new Date();
  const membership = await db.membership.create({
    data: {
      reference: `MEM-${id.toUpperCase().slice(-6)}`,
      userId: options.userId,
      planId: plan.id,
      status: options.status ?? 'ACTIVE',
      pricePaisa: plan.pricePaisa,
      periodDays: plan.periodDays,
      discountBp: plan.discountBp,
      maxDiscountPaisa: plan.maxDiscountPaisa,
      guaranteeBonusDays: plan.guaranteeBonusDays,
      priorityFanoutBonus: plan.priorityFanoutBonus,
      emergencyFeeWaiverPaisa: plan.emergencyFeeWaiverPaisa,
      startsAt: options.startsAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endsAt: options.endsAt ?? new Date(now.getTime() + 300 * 24 * 60 * 60 * 1000),
    },
  });
  return { plan, membership };
}
