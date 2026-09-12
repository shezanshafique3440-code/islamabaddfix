import { ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { verifyEmailSchema } from '@/lib/validation/schemas';
import { confirmEmailVerification, requestEmailVerification } from '@/lib/auth/verification';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/** Send (or resend) the confirmation link to the signed-in user's address. */
export const PUT = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.verification, rateLimitIdentity(request, ctx.user.id));

  const report = await requestEmailVerification(ctx.user.id);
  return ok({ delivered: report.delivered, devToken: report.devToken, notice: report.reason });
});

/**
 * Confirm a link. Deliberately unauthenticated: somebody clicking a link from
 * their email client may not be signed in there, and the token is the proof.
 */
export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.verification, rateLimitIdentity(request));
  const input = await parseJson(request, verifyEmailSchema);

  await confirmEmailVerification(input.token);
  return ok({ verified: true });
});
