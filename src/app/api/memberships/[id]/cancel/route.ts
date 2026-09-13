import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { membershipCancelSchema } from '@/lib/validation/schemas';
import { cancelMembership } from '@/lib/memberships';

export const POST = route(async (request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAuth();
  const { id } = await context.params;
  const input = await parseJson(request, membershipCancelSchema);

  const membership = await cancelMembership({
    membershipId: id,
    actorUserId: ctx.user.id,
    reason: input.reason,
  });
  return ok(membership);
});
