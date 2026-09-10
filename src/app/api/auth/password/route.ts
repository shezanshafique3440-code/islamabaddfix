import { ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { changePasswordSchema } from '@/lib/validation/schemas';
import { changePassword } from '@/lib/auth/service';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.passwordChange, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, changePasswordSchema);
  await changePassword(ctx.user.id, input.currentPassword, input.newPassword);
  // Every session was revoked, including this one — force a fresh login.
  await clearAuthCookies();
  return ok({ changed: true, reloginRequired: true });
});
