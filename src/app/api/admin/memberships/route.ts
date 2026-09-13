import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { adminMembershipQuerySchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const GET = route(async (request) => {
  await requirePermission('membership:manage');
  const query = parseQuery(request, adminMembershipQuerySchema);

  const where: Prisma.MembershipWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { reference: { contains: query.search, mode: 'insensitive' } },
            { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        plan: { select: { name: true, code: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.membership.count({ where }),
  ]);

  return ok(items, {
    pagination: { page: query.page, perPage: query.perPage, total },
  });
});
