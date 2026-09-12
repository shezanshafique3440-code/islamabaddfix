import { ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { closeAccountSchema } from '@/lib/validation/schemas';
import { closeAccount, closureBlockers } from '@/lib/account';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/** What currently stands in the way, so the UI can say so before asking. */
export const GET = route(async () => {
  const ctx = await requireAuth();
  const blockers = await closureBlockers(ctx.user.id);
  return ok({ canClose: blockers.length === 0, blockers });
});

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  // The password is required, so this is a credential-guessing surface.
  await enforceRateLimit(RATE_LIMITS.passwordChange, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, closeAccountSchema);

  await closeAccount({
    userId: ctx.user.id,
    password: input.password,
    reason: input.reason,
  });
  await clearAuthCookies();

  return ok({ closed: true });
});
