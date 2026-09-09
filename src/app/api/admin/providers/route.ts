import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { fileUrl } from '@/lib/storage';

const querySchema = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = route(async (request) => {
  await requirePermission('provider:approve');
  const query = parseQuery(request, querySchema);

  const where = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { businessName: { contains: query.search, mode: 'insensitive' as const } },
            { contactPhone: { contains: query.search } },
            { user: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
            { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.providerProfile.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: {
        id: true,
        businessName: true,
        slug: true,
        status: true,
        contactPhone: true,
        yearsExperience: true,
        ratingAverage: true,
        ratingCount: true,
        completedJobs: true,
        profilePhotoId: true,
        createdAt: true,
        verifiedAt: true,
        isDemo: true,
        user: { select: { id: true, fullName: true, email: true, isActive: true } },
        verifications: { select: { kind: true, status: true } },
        _count: { select: { services: true, serviceAreas: true, bookings: true } },
      },
    }),
    prisma.providerProfile.count({ where }),
  ]);

  return ok(
    items.map((provider) => ({
      ...provider,
      photoUrl: provider.profilePhotoId ? fileUrl(provider.profilePhotoId) : null,
    })),
    {
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    },
  );
});
