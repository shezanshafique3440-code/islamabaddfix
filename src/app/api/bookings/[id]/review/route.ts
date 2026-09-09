import { ok, created, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { createReviewSchema, rateCustomerSchema } from '@/lib/validation/schemas';
import { createReview, rateCustomer, updateReview } from '@/lib/bookings/reviews';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';

type Params = { params: Promise<{ id: string }> };

/** Customer review. One per booking; the DB enforces it too. */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await enforceRateLimit(RATE_LIMITS.review, rateLimitIdentity(request, ctx.user.id));

  const input = await parseJson(request, createReviewSchema);
  const review = await createReview({
    bookingId: id,
    authorId: ctx.user.id,
    rating: input.rating,
    comment: input.comment,
    serviceQuality: input.serviceQuality,
    professionalism: input.professionalism,
    punctuality: input.punctuality,
    valueForMoney: input.valueForMoney,
  });

  return created({ id: review.id, rating: review.rating, isPublished: review.isPublished });
});

/** Edit an existing review inside the configured window. */
export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = await parseJson(request, createReviewSchema.partial());

  const existing = await prisma.review.findUnique({
    where: { bookingId: id },
    select: { id: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Is booking ka review nahi mila.');

  const review = await updateReview({ reviewId: existing.id, authorId: ctx.user.id, ...input });
  return ok({ id: review.id, rating: review.rating });
});

/**
 * The provider's rating of the customer. Kept on a separate verb so it cannot
 * be confused with the public review, and never returned to other customers.
 */
export const PUT = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  if (!ctx.providerId) throw new AppError('FORBIDDEN', 'Sirf provider yeh rating de sakta hai.');

  const input = await parseJson(request, rateCustomerSchema);
  await rateCustomer({
    bookingId: id,
    providerId: ctx.providerId,
    rating: input.rating,
    comment: input.comment,
  });
  return ok({ recorded: true });
});
