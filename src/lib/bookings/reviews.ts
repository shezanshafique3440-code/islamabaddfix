import type { Review } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { getSetting } from '../settings';
import { notify, NOTIFICATION_EVENTS } from '../notifications';

/**
 * Reviews.
 *
 * Rules enforced here (and, for the one-per-booking rule, in the database via a
 * unique constraint on Review.bookingId):
 *  - only the booking's customer may review it
 *  - only after the booking is COMPLETED
 *  - exactly one review per booking, editable for a configurable window
 *  - the provider's rating aggregate is recomputed inside the same transaction
 */

export interface CreateReviewInput {
  bookingId: string;
  authorId: string;
  rating: number;
  comment?: string;
  serviceQuality?: number;
  professionalism?: number;
  punctuality?: number;
  valueForMoney?: number;
}

export async function createReview(input: CreateReviewInput): Promise<Review> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      customerId: true,
      providerId: true,
      status: true,
      reference: true,
      provider: { select: { userId: true, businessName: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  if (booking.customerId !== input.authorId) {
    throw new AppError('REVIEW_NOT_ALLOWED', 'Sirf booking ka customer review de sakta hai.');
  }
  if (booking.status !== 'COMPLETED') {
    throw new AppError(
      'REVIEW_NOT_ALLOWED',
      'Review sirf mukammal booking ke baad diya ja sakta hai.',
    );
  }
  if (!booking.providerId) {
    throw new AppError('REVIEW_NOT_ALLOWED', 'Is booking par koi technician assign nahi tha.');
  }

  const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (existing) {
    throw new AppError('REVIEW_ALREADY_EXISTS', 'Aap is booking ka review pehle de chuke hain.');
  }

  const autoPublish = await getSetting('reviews.autoPublish');
  const providerId = booking.providerId;

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        bookingId: booking.id,
        authorId: input.authorId,
        providerId,
        rating: input.rating,
        comment: input.comment?.trim() || null,
        serviceQuality: input.serviceQuality ?? null,
        professionalism: input.professionalism ?? null,
        punctuality: input.punctuality ?? null,
        valueForMoney: input.valueForMoney ?? null,
        isPublished: autoPublish,
      },
    });
    await recomputeProviderRating(tx, providerId);
    await recomputeCustomerAverage(tx, input.authorId);
    return created;
  });

  if (booking.provider?.userId) {
    await notify({
      event: NOTIFICATION_EVENTS.REVIEW_REQUESTED,
      userId: booking.provider.userId,
      title: 'Naya review mila',
      body: `${booking.reference} par customer ne ${input.rating} star diye.`,
      href: `/provider/reviews`,
      data: { bookingId: booking.id, rating: input.rating },
    });
  }

  return review;
}

/** Edit an existing review inside the configured window. */
export async function updateReview(params: {
  reviewId: string;
  authorId: string;
  rating?: number;
  comment?: string;
  serviceQuality?: number;
  professionalism?: number;
  punctuality?: number;
  valueForMoney?: number;
}): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id: params.reviewId } });
  if (!review) throw new AppError('NOT_FOUND', 'Review nahi mila.');
  if (review.authorId !== params.authorId) {
    throw new AppError('FORBIDDEN', 'Yeh review aapka nahi hai.');
  }

  const windowHours = await getSetting('reviews.editWindowHours');
  const deadline = review.createdAt.getTime() + windowHours * 60 * 60 * 1000;
  if (Date.now() > deadline) {
    throw new AppError(
      'REVIEW_NOT_ALLOWED',
      `Review sirf ${windowHours} ghante ke andar edit ho sakta hai.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({
      where: { id: review.id },
      data: {
        ...(params.rating !== undefined ? { rating: params.rating } : {}),
        ...(params.comment !== undefined ? { comment: params.comment.trim() || null } : {}),
        ...(params.serviceQuality !== undefined ? { serviceQuality: params.serviceQuality } : {}),
        ...(params.professionalism !== undefined ? { professionalism: params.professionalism } : {}),
        ...(params.punctuality !== undefined ? { punctuality: params.punctuality } : {}),
        ...(params.valueForMoney !== undefined ? { valueForMoney: params.valueForMoney } : {}),
      },
    });
    await recomputeProviderRating(tx, review.providerId);
    return updated;
  });
}

/**
 * The provider's rating of the customer.
 *
 * Stored on the same row but deliberately never returned by any public
 * selector — it exists so operations can spot problem jobs, not to build a
 * customer scoring system other customers can see.
 */
export async function rateCustomer(params: {
  bookingId: string;
  providerId: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: { id: true, providerId: true, status: true, customerId: true },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  if (booking.providerId !== params.providerId) {
    throw new AppError('FORBIDDEN', 'Yeh booking aap ko assign nahi hui.');
  }
  if (booking.status !== 'COMPLETED') {
    throw new AppError('REVIEW_NOT_ALLOWED', 'Rating sirf mukammal booking ke baad di ja sakti hai.');
  }

  // The Review row may not exist yet if the customer has not reviewed; upsert so
  // either party can go first.
  await prisma.review.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      // With no customer review yet, the customer is still the nominal author.
      authorId: booking.customerId,
      providerId: params.providerId,
      // Sentinel: not a customer rating. Excluded from aggregates below.
      rating: 0,
      isPublished: false,
      providerRatingOfCustomer: params.rating,
      providerCommentOnCustomer: params.comment?.trim() || null,
    },
    update: {
      providerRatingOfCustomer: params.rating,
      providerCommentOnCustomer: params.comment?.trim() || null,
    },
  });
}

/** Recompute a provider's rating aggregate from published customer reviews. */
async function recomputeProviderRating(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  providerId: string,
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { providerId, isPublished: true, rating: { gt: 0 } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await tx.providerProfile.update({
    where: { id: providerId },
    data: {
      ratingAverage: aggregate._avg.rating
        ? Math.round(aggregate._avg.rating * 100) / 100
        : null,
      ratingCount: aggregate._count.rating,
    },
  });
}

async function recomputeCustomerAverage(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  authorId: string,
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { authorId, rating: { gt: 0 } },
    _avg: { rating: true },
  });
  await tx.customerProfile.updateMany({
    where: { userId: authorId },
    data: {
      averageRatingGiven: aggregate._avg.rating
        ? Math.round(aggregate._avg.rating * 100) / 100
        : null,
    },
  });
}

/**
 * Public reviews for a provider profile. `rating: { gt: 0 }` filters out rows
 * that exist only to hold a provider's rating of a customer, and the selector
 * exposes only the reviewer's first name.
 */
export async function publicReviewsFor(
  providerId: string,
  options?: { take?: number; skip?: number },
) {
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where: { providerId, isPublished: true, rating: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: options?.take ?? 10,
      skip: options?.skip ?? 0,
      select: {
        id: true,
        rating: true,
        comment: true,
        serviceQuality: true,
        professionalism: true,
        punctuality: true,
        valueForMoney: true,
        createdAt: true,
        isDemo: true,
        author: { select: { fullName: true } },
        booking: { select: { service: { select: { name: true } } } },
      },
    }),
    prisma.review.count({ where: { providerId, isPublished: true, rating: { gt: 0 } } }),
  ]);

  return {
    total,
    items: items.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      breakdown: {
        serviceQuality: review.serviceQuality,
        professionalism: review.professionalism,
        punctuality: review.punctuality,
        valueForMoney: review.valueForMoney,
      },
      createdAt: review.createdAt,
      isDemo: review.isDemo,
      // Surname withheld: a full name plus a service and date is identifying.
      authorFirstName: review.author.fullName.split(/\s+/)[0] ?? 'Customer',
      serviceName: review.booking.service.name,
    })),
  };
}

/** Recent reviews across the platform, for the home page. */
export async function recentPlatformReviews(take = 6) {
  const items = await prisma.review.findMany({
    where: { isPublished: true, rating: { gte: 4 } },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      isDemo: true,
      author: { select: { fullName: true } },
      provider: { select: { businessName: true, slug: true } },
      booking: {
        select: {
          service: { select: { name: true } },
          address: { select: { zone: { select: { name: true } } } },
        },
      },
    },
  });

  return items
    .filter((review) => review.comment !== null && review.comment.length > 0)
    .map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment!,
      createdAt: review.createdAt,
      isDemo: review.isDemo,
      authorFirstName: review.author.fullName.split(/\s+/)[0] ?? 'Customer',
      providerName: review.provider.businessName,
      providerSlug: review.provider.slug,
      serviceName: review.booking.service.name,
      zoneName: review.booking.address.zone?.name ?? null,
    }));
}
