import { ok, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { assessPhoto } from '@/lib/ai/vision';

/**
 * Assess one uploaded photo.
 *
 * Shares the AI intake rate limit: both spend model budget on behalf of one
 * person, and a photo costs considerably more than a sentence.
 */
export const POST = route(async (request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.aiIntake, rateLimitIdentity(request, ctx.user.id));
  const { id } = await context.params;
  return ok(await assessPhoto({ fileId: id, requesterId: ctx.user.id }));
});
