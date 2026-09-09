import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  status: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = route(async (request) => {
  await requirePermission('guarantee:decide');
  const query = parseQuery(request, querySchema);
  const where = query.status ? { status: query.status as never } : {};

  const [items, total] = await Promise.all([
    prisma.guaranteeClaim.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            completedAt: true,
            guaranteeExpiresAt: true,
            guaranteeDays: true,
            finalTotalPaisa: true,
            service: { select: { name: true } },
            customer: { select: { fullName: true, phone: true } },
            provider: { select: { id: true, businessName: true } },
          },
        },
        _count: { select: { files: true } },
      },
    }),
    prisma.guaranteeClaim.count({ where }),
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
