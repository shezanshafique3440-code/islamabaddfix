import { ok, parseJson, rateLimitIdentity, requestMeta, route } from '@/lib/http';
import { loginSchema } from '@/lib/validation/schemas';
import { authenticateCredentials, issueSession, toSafeUser } from '@/lib/auth/service';
import { setAuthCookies } from '@/lib/auth/cookies';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { homeForRole } from '@/lib/auth/rbac';
import { isTwoFactorEnabled } from '@/lib/auth/two-factor';
import { issueTwoFactorChallenge } from '@/lib/auth/verification';

export const POST = route(async (request) => {
  const input = await parseJson(request, loginSchema);
  // Limit per email as well as per IP, so one account cannot be ground down
  // from a rotating set of addresses.
  await enforceRateLimit(RATE_LIMITS.login, rateLimitIdentity(request));
  await enforceRateLimit(RATE_LIMITS.login, `email:${input.email}`);

  const meta = requestMeta(request);
  const user = await authenticateCredentials(input, meta);

  // With a second factor enrolled, a correct password buys a challenge and
  // nothing else — no cookie is set until the code is in.
  if (await isTwoFactorEnabled(user.id)) {
    return ok({
      twoFactorRequired: true,
      challengeToken: await issueTwoFactorChallenge(user.id),
    });
  }

  const session = await issueSession(user, meta);
  await setAuthCookies({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    csrfToken: session.csrfToken,
  });

  return ok({
    user: toSafeUser(user),
    csrfToken: session.csrfToken,
    redirectTo: homeForRole(user.role),
  });
});
