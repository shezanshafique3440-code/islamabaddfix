import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { membershipPlanWriteSchema } from '@/lib/validation/schemas';
import { retirePlan, toPlanInput, upsertPlan } from '@/lib/memberships';

export const PATCH = route(async (request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requirePermission('membership:manage');
  const { id } = await context.params;
  const input = await parseJson(request, membershipPlanWriteSchema);
  const plan = await upsertPlan({ id, input: toPlanInput(input), actorUserId: ctx.user.id });
  return ok(plan);
});

export const DELETE = route(async (_request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requirePermission('membership:manage');
  const { id } = await context.params;
  // Soft delete: members who already bought this tier keep their benefits,
  // which live on their own row rather than on the plan.
  const plan = await retirePlan({ id, actorUserId: ctx.user.id });
  return ok(plan);
});
