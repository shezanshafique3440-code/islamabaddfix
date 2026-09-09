import { created, parseJson, rateLimitIdentity, requestMeta, route } from '@/lib/http';
import { registerSchema } from '@/lib/validation/schemas';
import { registerUser } from '@/lib/auth/service';
import { setAuthCookies } from '@/lib/auth/cookies';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { homeForRole } from '@/lib/auth/rbac';

export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.register, rateLimitIdentity(request));
  const input = await parseJson(request, registerSchema);
  const meta = requestMeta(request);

  const session = await registerUser(
    {
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      phone: input.phone,
      role: input.role,
    },
    meta,
  );

  await setAuthCookies({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    csrfToken: session.csrfToken,
  });

  return created({
    user: session.user,
    csrfToken: session.csrfToken,
    redirectTo: input.role === 'PROVIDER' ? '/provider/onboarding' : homeForRole(session.user.role),
  });
});
