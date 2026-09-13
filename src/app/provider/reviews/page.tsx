import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { publicReviewsFor } from '@/lib/bookings/reviews';
import { prisma } from '@/lib/db';
import { Rating } from '@/components/ui/Rating';
import { DemoBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Reviews', robots: { index: false, follow: false } };

export default async function ProviderReviewsPage() {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/reviews');
  if (!ctx.providerId) redirect('/provider/onboarding');

  const [reviews, profile, distribution] = await Promise.all([
    publicReviewsFor(ctx.providerId, { take: 25 }),
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: ctx.providerId },
      select: { ratingAverage: true, ratingCount: true, completedJobs: true },
    }),
    prisma.review.groupBy({
      by: ['rating'],
      where: { providerId: ctx.providerId, isPublished: true, rating: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);

  const total = distribution.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-display-sm text-ink-950">Reviews</h1>
        <p className="mt-1 text-sm text-ink-600">A better rating moves you up in matching.</p>
      </header>

      <section className="rounded-2xl border border-ink-200 bg-surface p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-3xl font-bold tracking-tight text-ink-950">
              {profile.ratingAverage ? profile.ratingAverage.toFixed(1) : '—'}
            </p>
            <Rating value={profile.ratingAverage} count={profile.ratingCount} size="sm" />
          </div>

          <div className="min-w-[12rem] flex-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = distribution.find((row) => row.rating === stars)?._count._all ?? 0;
              const percent = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-ink-600">{stars}★</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-warn-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-ink-500">{count}</span>
                </div>
              );
            })}
          </div>

          <div className="text-sm text-ink-600">
            <p>
              <strong className="font-semibold text-ink-900">{profile.completedJobs}</strong> jobs
              completed
            </p>
          </div>
        </div>
      </section>

      {reviews.items.length > 0 ? (
        <ul className="space-y-4">
          {reviews.items.map((review) => (
            <li key={review.id} className="rounded-2xl border border-ink-200 bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Rating value={review.rating} size="sm" />
                  <span className="text-sm font-medium text-ink-800">{review.authorFirstName}</span>
                  {review.isDemo ? <DemoBadge /> : null}
                </div>
                <span className="text-xs text-ink-500">{formatDate(review.createdAt)}</span>
              </div>

              {review.comment ? (
                <p className="mt-2.5 text-sm leading-relaxed text-ink-700">{review.comment}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-100 pt-2.5 text-xs text-ink-500">
                <span>{review.serviceName}</span>
                {review.breakdown.serviceQuality ? (
                  <span>Quality {review.breakdown.serviceQuality}/5</span>
                ) : null}
                {review.breakdown.professionalism ? (
                  <span>Professionalism {review.breakdown.professionalism}/5</span>
                ) : null}
                {review.breakdown.punctuality ? (
                  <span>Punctuality {review.breakdown.punctuality}/5</span>
                ) : null}
                {review.breakdown.valueForMoney ? (
                  <span>Value {review.breakdown.valueForMoney}/5</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No reviews yet"
          description="Customers can leave a review once jobs are completed."
        />
      )}
    </div>
  );
}
