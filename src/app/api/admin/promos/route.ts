import { created, ok, route, parseJson } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { promoWriteSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { percentToBasisPoints, rupeesToPaisa } from '@/lib/money';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';

export const GET = route(async () => {
  await requirePermission('settings:read');
  const promos = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { bookings: true } } },
  });
  return ok(promos);
});

export const POST = route(async (request) => {
  const ctx = await requirePermission('settings:write');
  const input = await parseJson(request, promoWriteSchema);

  // Percentages are stored as basis points, fixed amounts as paisa — one
  // integer column, two interpretations, decided by `kind`.
  const value =
    input.kind === 'PERCENTAGE' ? percentToBasisPoints(input.value) : rupeesToPaisa(input.value);

  const promo = await prisma.promoCode.create({
    data: {
      code: input.code,
      kind: input.kind,
      value,
      maxDiscountPaisa:
        input.maxDiscountRupees != null ? rupeesToPaisa(input.maxDiscountRupees) : null,
      minOrderPaisa: rupeesToPaisa(input.minOrderRupees),
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      isActive: input.isActive,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROMO_CHANGED,
    entity: 'PromoCode',
    entityId: promo.id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { operation: 'create', code: promo.code, kind: promo.kind, value },
  });

  return created(promo);
});
