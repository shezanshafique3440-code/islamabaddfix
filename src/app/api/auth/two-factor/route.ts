import { ok, parseJson, rateLimitIdentity, requestMeta, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { twoFactorChallengeSchema, twoFactorCodeSchema } from '@/lib/validation/schemas';
import {
  beginTwoFactorEnrolment,
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  twoFactorStatus,
  verifySecondFactor,
} from '@/lib/auth/two-factor';
import { consumeTwoFactorChallenge } from '@/lib/auth/verification';
import { issueSession, toSafeUser } from '@/lib/auth/service';
import { setAuthCookies } from '@/lib/auth/cookies';
import { homeForRole } from '@/lib/auth/rbac';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { AppError } from '@/lib/errors';

/** Whether this account has a second factor, and how many recovery codes are left. */
export const GET = route(async () => {
  const ctx = await requireAuth();
  return ok(await twoFactorStatus(ctx.user.id));
});

/**
 * Complete a sign-in that is waiting on a second factor.
 *
 * Unauthenticated by design: the challenge token *is* the proof that the
 * password was accepted, and no session exists yet to authenticate with.
 */
export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.otpAttempt, rateLimitIdentity(request));
  const input = await parseJson(request, twoFactorChallengeSchema);

  const userId = await consumeTwoFactorChallenge(input.challengeToken);
  if (!(await verifySecondFactor(userId, input.code))) {
    throw new AppError('INVALID_CREDENTIALS', 'The code is wrong or has already been used.');
  }

  const user = await prisma.user.findFirstOrThrow({
    where: { id: userId, isActive: true, deletedAt: null },
  });
  const session = await issueSession(user, requestMeta(request));
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

/** Start enrolment. Returns the secret and QR payload once, and never again. */
export const PUT = route(async () => {
  const ctx = await requireAuth();
  return ok(
    await beginTwoFactorEnrolment({
      userId: ctx.user.id,
      role: ctx.role,
      email: ctx.user.email,
    }),
  );
});

/** Finish enrolment (with a code) or turn it off (also with a code). */
export const PATCH = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.otpAttempt, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, twoFactorCodeSchema);

  if (input.action === 'disable') {
    await disableTwoFactor(ctx.user.id, input.code);
    return ok({ enabled: false });
  }

  const { recoveryCodes } = await confirmTwoFactorEnrolment(ctx.user.id, input.code);
  // Shown once. Only hashes are kept, exactly as for a password.
  return ok({ enabled: true, recoveryCodes });
});
