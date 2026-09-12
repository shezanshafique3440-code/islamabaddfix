import { ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { confirmPhoneCodeSchema, requestPhoneCodeSchema } from '@/lib/validation/schemas';
import { confirmPhoneVerification, requestPhoneVerification } from '@/lib/auth/verification';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/** Send a six-digit code to the caller's number. */
export const PUT = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.verification, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, requestPhoneCodeSchema);

  const report = await requestPhoneVerification(ctx.user.id, input.phone);
  return ok({
    delivered: report.delivered,
    sentTo: report.sentTo,
    devToken: report.devToken,
    notice: report.reason,
  });
});

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  // Tighter than the send limit: this one is guessing a six-digit secret.
  await enforceRateLimit(RATE_LIMITS.otpAttempt, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, confirmPhoneCodeSchema);

  await confirmPhoneVerification(ctx.user.id, input.code);
  return ok({ verified: true });
});
