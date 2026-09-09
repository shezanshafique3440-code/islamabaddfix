import { ok, rateLimitIdentity, requestMeta, route } from '@/lib/http';
import { refreshSession } from '@/lib/auth/service';
import { clearAuthCookies, readAuthCookies, setAuthCookies } from '@/lib/auth/cookies';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { AppError } from '@/lib/errors';

export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.refresh, rateLimitIdentity(request));
  const { refreshToken } = await readAuthCookies();
  if (!refreshToken) {
    throw new AppError('UNAUTHENTICATED', 'Session mojood nahi. Dobara login karein.');
  }

  try {
    const session = await refreshSession(refreshToken, requestMeta(request));
    await setAuthCookies({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      csrfToken: session.csrfToken,
    });
    return ok({ user: session.user, csrfToken: session.csrfToken });
  } catch (error) {
    // A dead or reused token leaves the browser holding useless cookies; clear
    // them so the next request is a clean unauthenticated one.
    await clearAuthCookies();
    throw error;
  }
});
