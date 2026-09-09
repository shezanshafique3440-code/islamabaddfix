import { ok, parseJson, rateLimitIdentity, requestMeta, route } from '@/lib/http';
import { loginSchema } from '@/lib/validation/schemas';
import { loginUser } from '@/lib/auth/service';
import { setAuthCookies } from '@/lib/auth/cookies';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { homeForRole } from '@/lib/auth/rbac';

export const POST = route(async (request) => {
  const input = await parseJson(request, loginSchema);
  // Limit per email as well as per IP, so one account cannot be ground down
  // from a rotating set of addresses.
  await enforceRateLimit(RATE_LIMITS.login, rateLimitIdentity(request));
  await enforceRateLimit(RATE_LIMITS.login, `email:${input.email}`);

  const session = await loginUser(input, requestMeta(request));

  await setAuthCookies({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    csrfToken: session.csrfToken,
  });

  return ok({
    user: session.user,
    csrfToken: session.csrfToken,
    redirectTo: homeForRole(session.user.role),
  });
});
