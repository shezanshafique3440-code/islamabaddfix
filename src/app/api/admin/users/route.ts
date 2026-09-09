import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { adminUserQuerySchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';

export const GET = route(async (request) => {
  await requirePermission('analytics:read');
  const query = parseQuery(request, adminUserQuerySchema);

  const where = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      // Never select passwordHash.
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
        lockedUntil: true,
        isDemo: true,
        createdAt: true,
        providerProfile: { select: { id: true, status: true, businessName: true } },
        _count: { select: { bookingsAsCustomer: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return ok(items, {
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  });
});
