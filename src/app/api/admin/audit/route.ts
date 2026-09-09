import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(80).optional(),
  actorUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

/** Read-only audit trail. There is deliberately no write or delete endpoint. */
export const GET = route(async (request) => {
  await requirePermission('audit:read');
  const query = parseQuery(request, querySchema);

  const where = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: { actor: { select: { id: true, fullName: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
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
