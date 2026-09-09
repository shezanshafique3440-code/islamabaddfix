import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { zoneWriteSchema } from '@/lib/validation/schemas';
import { deactivateZone, updateZone } from '@/lib/catalogue';

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('catalogue:write');
  const { id } = await params;
  const input = await parseJson(request, zoneWriteSchema.partial());
  const zone = await updateZone(id, input, { actorUserId: ctx.user.id, actorRole: ctx.role });
  return ok(zone);
});

/**
 * Deactivate rather than delete: customers' saved addresses point at zones and
 * must not lose their area because ops retired one.
 */
export const DELETE = route(async (_request, { params }: Params) => {
  const ctx = await requirePermission('catalogue:write');
  const { id } = await params;
  const zone = await deactivateZone(id, { actorUserId: ctx.user.id, actorRole: ctx.role });
  return ok({ deactivated: true, zone });
});
