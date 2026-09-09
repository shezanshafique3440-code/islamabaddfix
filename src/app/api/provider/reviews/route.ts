import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { publicReviewsFor } from '@/lib/bookings/reviews';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
});

export const GET = route(async (request) => {
  const ctx = await requireProvider();
  const query = parseQuery(request, querySchema);

  const [reviews, profile, breakdown] = await Promise.all([
    publicReviewsFor(ctx.providerId, {
      take: query.perPage,
      skip: (query.page - 1) * query.perPage,
    }),
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: ctx.providerId },
      select: { ratingAverage: true, ratingCount: true, completedJobs: true },
    }),
    // Star distribution, so a provider can see where they are losing points.
    prisma.review.groupBy({
      by: ['rating'],
      where: { providerId: ctx.providerId, isPublished: true, rating: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);

  return ok({
    summary: profile,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: breakdown.find((row) => row.rating === stars)?._count._all ?? 0,
    })),
    reviews: reviews.items,
    total: reviews.total,
  });
});
