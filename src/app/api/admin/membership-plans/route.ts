import { created, ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { membershipPlanWriteSchema } from '@/lib/validation/schemas';
import { listAllPlans, toPlanInput, upsertPlan } from '@/lib/memberships';

export const GET = route(async () => {
  await requirePermission('membership:manage');
  return ok(await listAllPlans());
});

export const POST = route(async (request) => {
  const ctx = await requirePermission('membership:manage');
  const input = await parseJson(request, membershipPlanWriteSchema);
  const plan = await upsertPlan({ input: toPlanInput(input), actorUserId: ctx.user.id });
  return created(plan);
});
