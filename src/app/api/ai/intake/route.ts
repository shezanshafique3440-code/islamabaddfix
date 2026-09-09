import { ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { intakeSchema } from '@/lib/validation/schemas';
import { runIntake, DIAGNOSIS_DISCLAIMER } from '@/lib/ai';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { getAuthContext } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

/**
 * Service intake assistant.
 *
 * Open to signed-out visitors — describing a problem is the first thing anyone
 * does — but rate-limited per user or IP. The response always states which
 * engine answered (`source`) so the UI can be honest about it, and carries the
 * standing disclaimer that this is not a diagnosis.
 */
export const POST = route(async (request) => {
  const ctx = await getAuthContext();
  await enforceRateLimit(RATE_LIMITS.aiIntake, rateLimitIdentity(request, ctx?.user.id));

  const input = await parseJson(request, intakeSchema);
  const result = await runIntake({ message: input.message, history: input.history });

  // Resolve slugs to ids so the client can move straight into the booking flow.
  const [category, service] = await Promise.all([
    result.categorySlug
      ? prisma.serviceCategory.findFirst({
          where: { slug: result.categorySlug, isActive: true, deletedAt: null },
          select: { id: true, name: true, slug: true, iconKey: true },
        })
      : null,
    result.serviceSlug
      ? prisma.service.findFirst({
          where: { slug: result.serviceSlug, isActive: true, deletedAt: null },
          select: { id: true, name: true, slug: true, minPricePaisa: true, maxPricePaisa: true },
        })
      : null,
  ]);

  return ok({
    ...result,
    category,
    service,
    disclaimer: DIAGNOSIS_DISCLAIMER,
  });
});
