import { prisma } from '../db';
import { fileUrl } from '../storage';

/**
 * Public provider projections.
 *
 * The privacy boundary lives here. A public provider card exposes trust signals
 * — rating, completed jobs, experience, verification badges — and nothing that
 * identifies or locates the person: no phone number, no home address, no bank
 * details, no CNIC reference, no GPS position.
 *
 * Every public listing also filters to `status: VERIFIED`, so an unverified or
 * suspended provider cannot appear through any of these functions.
 */

export const PUBLIC_PROVIDER_WHERE = {
  status: 'VERIFIED',
  deletedAt: null,
  user: { isActive: true, deletedAt: null },
} as const;

export interface PublicProviderCard {
  id: string;
  slug: string;
  businessName: string;
  headline: string | null;
  photoUrl: string | null;
  yearsExperience: number;
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  /** Minutes; null while the provider has no response history. */
  avgResponseMinutes: number | null;
  emergencyAvailable: boolean;
  emergencyFeePaisa: number;
  badges: Array<{ kind: string; label: string }>;
  isDemo: boolean;
}

const BADGE_LABELS: Record<string, string> = {
  IDENTITY_CNIC: 'Identity verified',
  PHONE: 'Phone verified',
  EMAIL: 'Email verified',
  PLATFORM_ONBOARDING: 'Platform verified',
  BANK_ACCOUNT: 'Payout verified',
};

const CARD_SELECT = {
  id: true,
  slug: true,
  businessName: true,
  headline: true,
  profilePhotoId: true,
  yearsExperience: true,
  ratingAverage: true,
  ratingCount: true,
  completedJobs: true,
  avgResponseMinutes: true,
  emergencyAvailable: true,
  emergencyFeePaisa: true,
  isDemo: true,
  verifications: { where: { status: 'APPROVED' as const }, select: { kind: true } },
} as const;

type CardRow = {
  id: string;
  slug: string;
  businessName: string;
  headline: string | null;
  profilePhotoId: string | null;
  yearsExperience: number;
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  avgResponseMinutes: number | null;
  emergencyAvailable: boolean;
  emergencyFeePaisa: number;
  isDemo: boolean;
  verifications: Array<{ kind: string }>;
};

export function toPublicCard(row: CardRow): PublicProviderCard {
  return {
    id: row.id,
    slug: row.slug,
    businessName: row.businessName,
    headline: row.headline,
    photoUrl: row.profilePhotoId ? fileUrl(row.profilePhotoId) : null,
    yearsExperience: row.yearsExperience,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    completedJobs: row.completedJobs,
    avgResponseMinutes: row.avgResponseMinutes,
    emergencyAvailable: row.emergencyAvailable,
    emergencyFeePaisa: row.emergencyFeePaisa,
    // Only badges backed by an APPROVED verification row are ever emitted.
    badges: row.verifications.map((v) => ({
      kind: v.kind,
      label: BADGE_LABELS[v.kind] ?? v.kind,
    })),
    isDemo: row.isDemo,
  };
}

export interface ListProvidersOptions {
  categorySlug?: string;
  serviceSlug?: string;
  zoneSlug?: string;
  emergencyOnly?: boolean;
  search?: string;
  minRating?: number;
  page?: number;
  perPage?: number;
  sort?: 'rating' | 'jobs' | 'experience' | 'newest';
}

/** Paginated public provider directory. */
export async function listPublicProviders(options: ListProvidersOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(48, Math.max(1, options.perPage ?? 12));

  const where = {
    ...PUBLIC_PROVIDER_WHERE,
    ...(options.emergencyOnly ? { emergencyAvailable: true } : {}),
    ...(options.minRating ? { ratingAverage: { gte: options.minRating } } : {}),
    ...(options.zoneSlug
      ? { serviceAreas: { some: { zone: { slug: options.zoneSlug, isActive: true } } } }
      : {}),
    ...(options.categorySlug || options.serviceSlug
      ? {
          services: {
            some: {
              isEnabled: true,
              service: {
                isActive: true,
                deletedAt: null,
                ...(options.serviceSlug ? { slug: options.serviceSlug } : {}),
                ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
              },
            },
          },
        }
      : {}),
    ...(options.search
      ? {
          OR: [
            { businessName: { contains: options.search, mode: 'insensitive' as const } },
            { headline: { contains: options.search, mode: 'insensitive' as const } },
            {
              services: {
                some: {
                  service: { name: { contains: options.search, mode: 'insensitive' as const } },
                },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy = (() => {
    switch (options.sort) {
      case 'jobs':
        return [{ completedJobs: 'desc' as const }];
      case 'experience':
        return [{ yearsExperience: 'desc' as const }];
      case 'newest':
        return [{ verifiedAt: 'desc' as const }];
      default:
        // Nulls last so unrated providers do not head the list.
        return [
          { ratingAverage: { sort: 'desc' as const, nulls: 'last' as const } },
          { completedJobs: 'desc' as const },
        ];
    }
  })();

  const [rows, total] = await Promise.all([
    prisma.providerProfile.findMany({
      where,
      select: CARD_SELECT,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.providerProfile.count({ where }),
  ]);

  return {
    items: rows.map(toPublicCard),
    pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  };
}

/** Full public profile page data. Still no contact details. */
export async function getPublicProvider(slug: string) {
  const provider = await prisma.providerProfile.findFirst({
    where: { slug, ...PUBLIC_PROVIDER_WHERE },
    select: {
      ...CARD_SELECT,
      description: true,
      city: true,
      createdAt: true,
      verifiedAt: true,
      services: {
        where: { isEnabled: true, service: { isActive: true, deletedAt: null } },
        select: {
          startingPricePaisa: true,
          service: {
            select: {
              id: true,
              name: true,
              slug: true,
              requiresInspection: true,
              estimatedMinutes: true,
              category: { select: { name: true, slug: true, iconKey: true } },
            },
          },
        },
      },
      serviceAreas: {
        where: { zone: { isActive: true } },
        select: { zone: { select: { name: true, slug: true } } },
      },
      availability: {
        where: { isEnabled: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
    },
  });
  if (!provider) return null;

  return {
    ...toPublicCard(provider),
    description: provider.description,
    city: provider.city,
    memberSince: provider.verifiedAt ?? provider.createdAt,
    services: provider.services.map((entry) => ({
      id: entry.service.id,
      name: entry.service.name,
      slug: entry.service.slug,
      startingPricePaisa: entry.startingPricePaisa,
      requiresInspection: entry.service.requiresInspection,
      estimatedMinutes: entry.service.estimatedMinutes,
      category: entry.service.category,
    })),
    zones: provider.serviceAreas.map((area) => area.zone),
    availability: provider.availability,
  };
}

/**
 * The provider's own view of their profile — includes the private fields they
 * submitted, but the IBAN only as its last four digits. The full IBAN is stored
 * as a hash and is not retrievable by anyone, including the provider.
 */
export async function getOwnProviderProfile(userId: string) {
  const provider = await prisma.providerProfile.findFirst({
    where: { userId, deletedAt: null },
    include: {
      verifications: { orderBy: { kind: 'asc' } },
      services: { include: { service: { include: { category: true } } } },
      serviceAreas: { include: { zone: true } },
      availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      documents: {
        where: { deletedAt: null, purpose: 'PROVIDER_DOCUMENT' },
        select: { id: true, originalName: true, createdAt: true, mimeType: true, sizeBytes: true },
      },
    },
  });
  if (!provider) return null;

  const { bankIbanHash: _bankIbanHash, ...safe } = provider;
  return {
    ...safe,
    photoUrl: provider.profilePhotoId ? fileUrl(provider.profilePhotoId) : null,
    bankIbanMasked: provider.bankAccountLast4 ? `•••• ${provider.bankAccountLast4}` : null,
  };
}
