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
  title: 'Aaj ka kaam',
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
        <h1 className="text-display-sm text-ink-950">Aaj ka kaam</h1>
        <p className="mt-1 text-sm text-ink-600">
          {jobs.length === 0
            ? 'Aaj koi job scheduled nahi hai.'
            : `Aaj ${jobs.length} job${jobs.length === 1 ? '' : 's'} hain.`}
        </p>
      </header>

      {/* Today's numbers first — this is what a technician checks on their phone. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Aaj ki kamai" value={formatPaisa(earnings.today.earningsPaisa)} />
        <Stat label="Is hafte" value={formatPaisa(earnings.week.earningsPaisa)} />
        <Stat
          label="Rating"
          value={ratings.ratingAverage ? `${ratings.ratingAverage.toFixed(1)} ★` : '—'}
          hint={ratings.ratingCount > 0 ? `${ratings.ratingCount} reviews` : 'Koi review nahi'}
        />
        <Stat label="Total jobs" value={String(ratings.completedJobs)} />
      </dl>

      {offers.length > 0 ? (
        <section aria-labelledby="offers-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="offers-heading" className="text-title text-ink-950">
              Nayi job requests ({offers.length})
            </h2>
            <Link
              href="/provider/jobs?view=offers"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Sab dekhein →
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink-600">
            Jitni jaldi jawab denge, utna hi behtar aap ki ranking hogi.
          </p>
          <div className="mt-4">
            <JobOfferList offers={offers.slice(0, 3)} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-title text-ink-950">
          Aaj ka schedule
        </h2>
        <div className="mt-4">
          {jobs.length > 0 ? (
            <TodaySchedule jobs={jobs.map(summarizeBooking)} />
          ) : (
            <EmptyState
              title="Aaj koi job nahi"
              description={
                offers.length > 0
                  ? 'Oopar di gayi requests qubool karke apna din bharein.'
                  : 'Nayi requests aane par aap ko notification milega.'
              }
            />
          )}
        </div>
      </section>

      {earnings.pendingPayout.jobs > 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Pending payout</h2>
          <p className="mt-1.5 text-sm text-ink-600">
            {earnings.pendingPayout.jobs} mukammal job(s) ki{' '}
            <strong className="font-semibold text-ink-900">
              {formatPaisa(earnings.pendingPayout.earningsPaisa)}
            </strong>{' '}
            abhi kisi payout mein shamil nahi hui.
          </p>
          <Link
            href="/provider/earnings"
            className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            Earnings dekhein →
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
