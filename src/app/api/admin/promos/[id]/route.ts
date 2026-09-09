import { z } from 'zod';
import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/** Only the switch and the window are editable — value changes need a new code. */
const patchSchema = z.object({
  isActive: z.boolean().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
});

export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('settings:write');
  const { id } = await params;
  const input = await parseJson(request, patchSchema);

  const promo = await prisma.promoCode.update({
    where: { id },
    data: {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROMO_CHANGED,
    entity: 'PromoCode',
    entityId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { operation: 'update', changes: input },
  });

  return ok(promo);
});
