import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { membershipConfirmSchema } from '@/lib/validation/schemas';
import { confirmMembershipPayment } from '@/lib/memberships';

/**
 * Operations confirms a membership payment arrived.
 *
 * Admin-only on purpose: with no online gateway configured there is no
 * automatic path from "clicked subscribe" to "has paid", and a button that
 * pretended otherwise would be the fake functionality this product refuses.
 */
export const POST = route(async (request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requirePermission('membership:manage');
  const { id } = await context.params;
  const input = await parseJson(request, membershipConfirmSchema);

  const membership = await confirmMembershipPayment({
    membershipId: id,
    actorUserId: ctx.user.id,
    externalRef: input.externalRef ?? null,
  });
  return ok(membership);
});
