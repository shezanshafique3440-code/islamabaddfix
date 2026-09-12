import { prisma } from './db';
import { AppError } from './errors';
import { uniqueSlug } from './ids';
import { AUDIT_ACTIONS, recordAudit } from './audit';
import type { Role } from '@prisma/client';

/**
 * Service catalogue and service zones.
 *
 * Categories, services and zones are all admin-managed data. No sector list,
 * category list or price is hard-coded in business logic — the seed script
 * provides a starting set and the admin panel owns it from then on.
 *
 * Deletes are soft for categories and services because bookings reference them
 * and financial history must stay readable.
 */

// ============================== read side =================================

/** Active catalogue tree for public pages and the booking wizard. */
export async function getCatalogue() {
  return prisma.serviceCategory.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      tagline: true,
      description: true,
      iconKey: true,
      isEmergencyCategory: true,
      services: {
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          minPricePaisa: true,
          maxPricePaisa: true,
          requiresInspection: true,
          estimatedMinutes: true,
          isEmergencyEnabled: true,
          guaranteeEligible: true,
        },
      },
    },
  });
}

export type Catalogue = Awaited<ReturnType<typeof getCatalogue>>;

export async function getCategoryBySlug(slug: string) {
  return prisma.serviceCategory.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    include: {
      services: {
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

export async function getServiceBySlug(slug: string) {
  return prisma.service.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    include: { category: true },
  });
}

/** Emergency-enabled services, grouped for the emergency booking screen. */
export async function getEmergencyServices() {
  return prisma.service.findMany({
    where: { isActive: true, deletedAt: null, isEmergencyEnabled: true },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: { category: { select: { name: true, slug: true, iconKey: true } } },
  });
}

export async function listZones(options?: { activeOnly?: boolean; city?: string }) {
  return prisma.serviceZone.findMany({
    where: {
      ...(options?.activeOnly === false ? {} : { isActive: true }),
      ...(options?.city ? { city: options.city } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Fuzzy-ish catalogue search. Postgres `ILIKE` on name plus description, which
 * is the right amount of machinery for a catalogue of this size; the query also
 * matches category names so "cooling" finds the AC services.
 */
export async function searchCatalogue(query: string, limit = 12) {
  const term = query.trim();
  if (term.length < 2) return { categories: [], services: [] };

  const [categories, services] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { tagline: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, name: true, slug: true, iconKey: true, tagline: true },
    }),
    prisma.service.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { category: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
      take: limit,
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        minPricePaisa: true,
        maxPricePaisa: true,
        category: { select: { name: true, slug: true, iconKey: true } },
      },
    }),
  ]);

  return { categories, services };
}

// ============================== write side ================================

interface Actor {
  actorUserId: string;
  actorRole: Role;
}

export interface CategoryInput {
  name: string;
  tagline?: string;
  description?: string;
  iconKey?: string;
  sortOrder?: number;
  isActive?: boolean;
  isEmergencyCategory?: boolean;
  guaranteeEligible?: boolean;
}

export async function createCategory(input: CategoryInput, actor: Actor) {
  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(
      await prisma.serviceCategory.findUnique({ where: { slug: candidate }, select: { id: true } }),
    ),
  );
  const category = await prisma.serviceCategory.create({
    data: {
      name: input.name.trim(),
      slug,
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      iconKey: input.iconKey ?? 'wrench',
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      isEmergencyCategory: input.isEmergencyCategory ?? false,
      guaranteeEligible: input.guaranteeEligible ?? true,
    },
  });
  await recordAudit({
    action: AUDIT_ACTIONS.CATEGORY_CHANGED,
    entity: 'ServiceCategory',
    entityId: category.id,
    ...actor,
    metadata: { operation: 'create', name: category.name },
  });
  return category;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>, actor: Actor) {
  const existing = await prisma.serviceCategory.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('NOT_FOUND', 'Category nahi mili.');

  const category = await prisma.serviceCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline.trim() || null } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isEmergencyCategory !== undefined
        ? { isEmergencyCategory: input.isEmergencyCategory }
        : {}),
      ...(input.guaranteeEligible !== undefined
        ? { guaranteeEligible: input.guaranteeEligible }
        : {}),
    },
  });
  await recordAudit({
    action: AUDIT_ACTIONS.CATEGORY_CHANGED,
    entity: 'ServiceCategory',
    entityId: id,
    ...actor,
    metadata: { operation: 'update', changes: input },
  });
  return category;
}

/**
 * Soft-delete a category and deactivate its services.
 *
 * Refuses while any service under it has a live booking — deleting the category
 * out from under an in-flight job would orphan the customer's record.
 */
export async function deleteCategory(id: string, actor: Actor) {
  const liveBookings = await prisma.booking.count({
    where: {
      service: { categoryId: id },
      status: {
        in: [
          'PENDING',
          'PROVIDER_NOTIFIED',
          'ACCEPTED',
          'QUOTE_PENDING',
          'QUOTE_APPROVED',
          'SCHEDULED',
          'ON_THE_WAY',
          'ARRIVED',
          'IN_PROGRESS',
        ],
      },
    },
  });
  if (liveBookings > 0) {
    throw new AppError(
      'CONFLICT',
      `Is category ki ${liveBookings} live booking(s) hain. Pehle unhe mukammal ya cancel karein.`,
    );
  }

  await prisma.$transaction([
    prisma.serviceCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    }),
    prisma.service.updateMany({ where: { categoryId: id }, data: { isActive: false } }),
  ]);

  await recordAudit({
    action: AUDIT_ACTIONS.CATEGORY_CHANGED,
    entity: 'ServiceCategory',
    entityId: id,
    ...actor,
    metadata: { operation: 'soft_delete' },
  });
}

export interface ServiceInput {
  categoryId: string;
  name: string;
  description?: string;
  minPricePaisa?: number;
  maxPricePaisa?: number | null;
  requiresInspection?: boolean;
  estimatedMinutes?: number;
  isActive?: boolean;
  isEmergencyEnabled?: boolean;
  guaranteeEligible?: boolean;
  guaranteeDaysOverride?: number | null;
  sortOrder?: number;
}

export async function createService(input: ServiceInput, actor: Actor) {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: input.categoryId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!category) throw new AppError('NOT_FOUND', 'Category nahi mili.');

  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(await prisma.service.findUnique({ where: { slug: candidate }, select: { id: true } })),
  );

  const service = await prisma.service.create({
    data: {
      categoryId: category.id,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      minPricePaisa: input.minPricePaisa ?? 0,
      maxPricePaisa: input.maxPricePaisa ?? null,
      requiresInspection: input.requiresInspection ?? true,
      estimatedMinutes: input.estimatedMinutes ?? 60,
      isActive: input.isActive ?? true,
      isEmergencyEnabled: input.isEmergencyEnabled ?? false,
      guaranteeEligible: input.guaranteeEligible ?? true,
      guaranteeDaysOverride: input.guaranteeDaysOverride ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.SERVICE_CHANGED,
    entity: 'Service',
    entityId: service.id,
    ...actor,
    metadata: { operation: 'create', name: service.name, categoryId: category.id },
  });
  return service;
}

export async function updateService(id: string, input: Partial<ServiceInput>, actor: Actor) {
  const existing = await prisma.service.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('NOT_FOUND', 'Service nahi mili.');

  if (
    input.maxPricePaisa != null &&
    input.maxPricePaisa < (input.minPricePaisa ?? existing.minPricePaisa)
  ) {
    throw new AppError('VALIDATION_ERROR', 'Maximum price minimum se kam nahi ho sakti.');
  }

  const service = await prisma.service.update({
    where: { id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.minPricePaisa !== undefined ? { minPricePaisa: input.minPricePaisa } : {}),
      ...(input.maxPricePaisa !== undefined ? { maxPricePaisa: input.maxPricePaisa } : {}),
      ...(input.requiresInspection !== undefined
        ? { requiresInspection: input.requiresInspection }
        : {}),
      ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isEmergencyEnabled !== undefined
        ? { isEmergencyEnabled: input.isEmergencyEnabled }
        : {}),
      ...(input.guaranteeEligible !== undefined
        ? { guaranteeEligible: input.guaranteeEligible }
        : {}),
      ...(input.guaranteeDaysOverride !== undefined
        ? { guaranteeDaysOverride: input.guaranteeDaysOverride }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.SERVICE_CHANGED,
    entity: 'Service',
    entityId: id,
    ...actor,
    metadata: { operation: 'update', changes: input },
  });
  return service;
}

export async function deleteService(id: string, actor: Actor) {
  const liveBookings = await prisma.booking.count({
    where: {
      serviceId: id,
      status: {
        in: [
          'PENDING',
          'PROVIDER_NOTIFIED',
          'ACCEPTED',
          'QUOTE_PENDING',
          'QUOTE_APPROVED',
          'SCHEDULED',
          'ON_THE_WAY',
          'ARRIVED',
          'IN_PROGRESS',
        ],
      },
    },
  });
  if (liveBookings > 0) {
    throw new AppError(
      'CONFLICT',
      `Is service ki ${liveBookings} live booking(s) hain. Pehle unhe mukammal ya cancel karein.`,
    );
  }

  await prisma.service.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.SERVICE_CHANGED,
    entity: 'Service',
    entityId: id,
    ...actor,
    metadata: { operation: 'soft_delete' },
  });
}

export interface ZoneInput {
  name: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createZone(input: ZoneInput, actor: Actor) {
  const slug = await uniqueSlug(`${input.city ?? 'islamabad'}-${input.name}`, async (candidate) =>
    Boolean(
      await prisma.serviceZone.findUnique({ where: { slug: candidate }, select: { id: true } }),
    ),
  );
  const zone = await prisma.serviceZone.create({
    data: {
      name: input.name.trim(),
      slug,
      city: input.city?.trim() || 'Islamabad',
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await recordAudit({
    action: AUDIT_ACTIONS.ZONE_CHANGED,
    entity: 'ServiceZone',
    entityId: zone.id,
    ...actor,
    metadata: { operation: 'create', name: zone.name, city: zone.city },
  });
  return zone;
}

export async function updateZone(id: string, input: Partial<ZoneInput>, actor: Actor) {
  const zone = await prisma.serviceZone.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.city !== undefined ? { city: input.city.trim() } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await recordAudit({
    action: AUDIT_ACTIONS.ZONE_CHANGED,
    entity: 'ServiceZone',
    entityId: id,
    ...actor,
    metadata: { operation: 'update', changes: input },
  });
  return zone;
}

/**
 * Deactivate a zone rather than deleting it: addresses point at zones, and a
 * customer's saved address should not lose its area because ops retired a zone.
 */
export async function deactivateZone(id: string, actor: Actor) {
  const zone = await prisma.serviceZone.update({ where: { id }, data: { isActive: false } });
  await recordAudit({
    action: AUDIT_ACTIONS.ZONE_CHANGED,
    entity: 'ServiceZone',
    entityId: id,
    ...actor,
    metadata: { operation: 'deactivate' },
  });
  return zone;
}

/** Admin catalogue view — includes inactive and soft-deleted rows. */
export async function getAdminCatalogue() {
  return prisma.serviceCategory.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      services: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { bookings: true, providerServices: true } } },
      },
    },
  });
}
