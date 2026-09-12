import { ok, parseJson, rateLimitIdentity, requestMeta, route } from '@/lib/http';
import { forgotPasswordSchema } from '@/lib/validation/schemas';
import { requestPasswordReset } from '@/lib/auth/verification';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/**
 * Start a password reset.
 *
 * Always answers the same way, registered address or not — anything else makes
 * this an account-existence oracle. Limited by IP and by address, so it cannot
 * be used to mail-bomb somebody either.
 */
export const POST = route(async (request) => {
  const input = await parseJson(request, forgotPasswordSchema);
  await enforceRateLimit(RATE_LIMITS.passwordReset, rateLimitIdentity(request));
  await enforceRateLimit(RATE_LIMITS.passwordReset, `email:${input.email.toLowerCase()}`);

  const report = await requestPasswordReset(input.email, requestMeta(request));

  return ok({
    // Deliberately constant: the caller learns nothing about the account.
    message:
      'Agar yeh email register hai to reset link bhej diya gaya hai. Inbox aur spam folder dekhein.',
    delivered: report.delivered,
    // Only ever set outside production, and only when no mail provider exists.
    devToken: report.devToken,
    notice: report.reason,
  });
});
