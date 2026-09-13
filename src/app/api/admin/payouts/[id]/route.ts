import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { markPayoutPaidSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';
import { notify, NOTIFICATION_EVENTS } from '@/lib/notifications';
import { formatPaisa } from '@/lib/money';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request, { params }: Params) => {
  await requirePermission('payout:manage');
  const { id } = await params;
  const payout = await prisma.payout.findUnique({
    where: { id },
    include: {
      provider: {
        select: {
          id: true,
          businessName: true,
          bankName: true,
          bankAccountTitle: true,
          bankAccountLast4: true,
          userId: true,
        },
      },
      items: {
        include: {
          booking: {
            select: {
              id: true,
              reference: true,
              completedAt: true,
              service: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!payout) throw new AppError('NOT_FOUND', 'Payout not found.');
  return ok(payout);
});

/**
 * Mark a payout as paid.
 *
 * The bank transfer itself happens outside this system — automated payouts are
 * a later phase. This records that a human sent the money, with a reference.
 */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('payout:manage');
  const { id } = await params;
  const input = await parseJson(request, markPayoutPaidSchema);

  const existing = await prisma.payout.findUnique({
    where: { id },
    select: { id: true, status: true, netPaisa: true, provider: { select: { userId: true } } },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Payout not found.');
  if (existing.status === 'PAID') {
    throw new AppError('CONFLICT', 'This payout has already been paid.');
  }

  const payout = await prisma.payout.update({
    where: { id },
    data: {
      status: 'PAID',
      processedAt: new Date(),
      reference: input.reference ?? null,
      notes: input.notes ?? undefined,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYOUT_MARKED_PAID,
    entity: 'Payout',
    entityId: payout.id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { netPaisa: payout.netPaisa, reference: input.reference ?? null },
  });

  await notify({
    event: NOTIFICATION_EVENTS.PAYMENT_RECORDED,
    userId: existing.provider.userId,
    title: 'Payout sent',
    body: `A payout of ${formatPaisa(payout.netPaisa)} has been processed.${
      input.reference ? ` Reference: ${input.reference}` : ''
    }`,
    href: '/provider/earnings',
    data: { payoutId: payout.id },
  });

  return ok({ status: payout.status, processedAt: payout.processedAt });
});
