import { z } from 'zod';
import { created, ok, parseJson, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { createPayoutSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';

const querySchema = z.object({
  providerId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = route(async (request) => {
  await requirePermission('payout:manage');
  const query = parseQuery(request, querySchema);

  const where = {
    ...(query.providerId ? { providerId: query.providerId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        provider: {
          select: { id: true, businessName: true, bankAccountLast4: true, bankName: true },
        },
        _count: { select: { items: true } },
      },
    }),
    prisma.payout.count({ where }),
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

/**
 * Build a payout for a provider over a period.
 *
 * Only completed bookings not already in a payout are included, and the totals
 * come from the commission split frozen on each booking — this never recomputes
 * commission at a rate that was not in force when the job was done.
 */
export const POST = route(async (request) => {
  const ctx = await requirePermission('payout:manage');
  const input = await parseJson(request, createPayoutSchema);

  if (input.periodEnd < input.periodStart) {
    throw new AppError('VALIDATION_ERROR', 'The end of the period cannot be before the start.');
  }

  const bookings = await prisma.booking.findMany({
    where: {
      providerId: input.providerId,
      status: 'COMPLETED',
      completedAt: { gte: input.periodStart, lte: input.periodEnd },
      payoutItems: { none: {} },
    },
    select: {
      id: true,
      finalTotalPaisa: true,
      commissionPaisa: true,
      providerEarningsPaisa: true,
    },
  });

  if (bookings.length === 0) {
    throw new AppError(
      'NOT_FOUND',
      'There are no completed bookings in this period that are not already in a payout.',
    );
  }

  const totals = bookings.reduce(
    (acc, booking) => ({
      gross: acc.gross + (booking.finalTotalPaisa ?? 0),
      commission: acc.commission + (booking.commissionPaisa ?? 0),
      net: acc.net + (booking.providerEarningsPaisa ?? 0),
    }),
    { gross: 0, commission: 0, net: 0 },
  );

  const payout = await prisma.payout.create({
    data: {
      providerId: input.providerId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossPaisa: totals.gross,
      commissionPaisa: totals.commission,
      netPaisa: totals.net,
      notes: input.notes ?? null,
      items: {
        create: bookings.map((booking) => ({
          bookingId: booking.id,
          grossPaisa: booking.finalTotalPaisa ?? 0,
          commissionPaisa: booking.commissionPaisa ?? 0,
          netPaisa: booking.providerEarningsPaisa ?? 0,
        })),
      },
    },
    include: { _count: { select: { items: true } } },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYOUT_CREATED,
    entity: 'Payout',
    entityId: payout.id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { providerId: input.providerId, ...totals, bookings: bookings.length },
  });

  return created(payout);
});
