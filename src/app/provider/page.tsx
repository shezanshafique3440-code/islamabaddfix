import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { getProviderOffers, getProviderSchedule, summarizeBooking } from '@/lib/bookings/queries';
import { getProviderEarnings } from '@/lib/analytics';
import { prisma } from '@/lib/db';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisa } from '@/lib/money';
import { JobOfferList } from '@/components/provider/JobOfferList';
import { TodaySchedule } from '@/components/provider/TodaySchedule';

export const metadata: Metadata = {
  title: 'Today’s work',
  robots: { index: false, follow: false },
};

export default async function ProviderTodayPage() {
  const ctx = await requirePageRole(['PROVIDER'], '/provider');

  // No profile yet: onboarding is the only sensible destination.
  if (!ctx.providerId) redirect('/provider/onboarding');

  const [jobs, offers, earnings, ratings] = await Promise.all([
    getProviderSchedule(ctx.providerId, new Date()),
    getProviderOffers(ctx.providerId),
    getProviderEarnings(ctx.providerId),
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: ctx.providerId },
      select: { ratingAverage: true, ratingCount: true, completedJobs: true, responseRate: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-display-sm text-ink-950">Today’s work</h1>
        <p className="mt-1 text-sm text-ink-600">
          {jobs.length === 0
            ? 'No jobs are scheduled for today.'
            : `${jobs.length} job${jobs.length === 1 ? '' : 's'} scheduled for today.`}
        </p>
      </header>

      {/* Today's numbers first — this is what a technician checks on their phone. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Earned today" value={formatPaisa(earnings.today.earningsPaisa)} />
        <Stat label="This week" value={formatPaisa(earnings.week.earningsPaisa)} />
        <Stat
          label="Rating"
          value={ratings.ratingAverage ? `${ratings.ratingAverage.toFixed(1)} ★` : '—'}
          hint={ratings.ratingCount > 0 ? `${ratings.ratingCount} reviews` : 'No reviews'}
        />
        <Stat label="Total jobs" value={String(ratings.completedJobs)} />
      </dl>

      {offers.length > 0 ? (
        <section aria-labelledby="offers-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="offers-heading" className="text-title text-ink-950">
              New job requests ({offers.length})
            </h2>
            <Link
              href="/provider/jobs?view=offers"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              View all →
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink-600">
            The faster you respond, the better your ranking.
          </p>
          <div className="mt-4">
            <JobOfferList offers={offers.slice(0, 3)} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-title text-ink-950">
          Today’s schedule
        </h2>
        <div className="mt-4">
          {jobs.length > 0 ? (
            <TodaySchedule jobs={jobs.map(summarizeBooking)} />
          ) : (
            <EmptyState
              title="No jobs today"
              description={
                offers.length > 0
                  ? 'Accept the requests above to fill your day.'
                  : 'You will be notified when new requests arrive.'
              }
            />
          )}
        </div>
      </section>

      {earnings.pendingPayout.jobs > 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Pending payout</h2>
          <p className="mt-1.5 text-sm text-ink-600">
            <strong className="font-semibold text-ink-900">
              {formatPaisa(earnings.pendingPayout.earningsPaisa)}
            </strong>{' '}
            from {earnings.pendingPayout.jobs} completed job(s) is not in a payout yet.
          </p>
          <Link
            href="/provider/earnings"
            className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            View earnings →
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3.5">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 text-lg font-bold tracking-tight text-ink-950">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
