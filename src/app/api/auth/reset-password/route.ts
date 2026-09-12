import { ok, parseJson, parseQuery, rateLimitIdentity, route } from '@/lib/http';
import { z } from 'zod';
import { resetPasswordSchema } from '@/lib/validation/schemas';
import { isResetTokenLive, resetPassword } from '@/lib/auth/verification';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { clearAuthCookies } from '@/lib/auth/cookies';

/** Is this link still usable? Lets the page fail before asking for a password. */
export const GET = route(async (request) => {
  const { token } = parseQuery(request, z.object({ token: z.string().min(1).max(400) }));
  return ok({ valid: await isResetTokenLive(token) });
});

export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.passwordReset, rateLimitIdentity(request));
  const input = await parseJson(request, resetPasswordSchema);

  await resetPassword(input.token, input.newPassword);
  // Every session was revoked, including any this browser held.
  await clearAuthCookies();

  return ok({ reset: true, reloginRequired: true });
});
