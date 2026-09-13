import { created, ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { membershipPurchaseSchema } from '@/lib/validation/schemas';
import { activeBenefitsFor, membershipsFor, purchaseMembership } from '@/lib/memberships';

export const GET = route(async () => {
  const ctx = await requireAuth();
  const [memberships, benefits] = await Promise.all([
    membershipsFor(ctx.user.id),
    activeBenefitsFor(ctx.user.id),
  ]);
  return ok(memberships, { activeBenefits: benefits });
});

export const POST = route(async (request) => {
  const ctx = await requirePermission('membership:buy');
  await enforceRateLimit(RATE_LIMITS.membershipPurchase, rateLimitIdentity(request, ctx.user.id));

  const input = await parseJson(request, membershipPurchaseSchema);
  const membership = await purchaseMembership({
    userId: ctx.user.id,
    planId: input.planId,
    method: input.method,
  });

  return created(membership, {
    // Nothing has been charged. Say so rather than implying the plan is live.
    awaitingPaymentConfirmation: true,
  });
});
