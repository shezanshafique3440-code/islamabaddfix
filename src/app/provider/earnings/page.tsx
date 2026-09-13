import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { getProviderEarnings } from '@/lib/analytics';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { formatPaisa } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Earnings', robots: { index: false, follow: false } };

export default async function ProviderEarningsPage() {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/earnings');
  if (!ctx.providerId) redirect('/provider/onboarding');

  const [earnings, payouts, commissionRateBp, recentJobs] = await Promise.all([
    getProviderEarnings(ctx.providerId),
    prisma.payout.findMany({
      where: { providerId: ctx.providerId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    getSetting('platform.commissionRateBp'),
    prisma.booking.findMany({
      where: { providerId: ctx.providerId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        reference: true,
        completedAt: true,
        finalTotalPaisa: true,
        commissionPaisa: true,
        providerEarningsPaisa: true,
        service: { select: { name: true } },
        payoutItems: { select: { id: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-display-sm text-ink-950">Earnings</h1>
        <p className="mt-1 text-sm text-ink-600">
          Platform commission is {commissionRateBp / 100}%, deducted from your earnings on every
          completed booking.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Today"
          value={formatPaisa(earnings.today.earningsPaisa)}
          hint={`${earnings.today.jobs} job`}
        />
        <Stat
          label="This week"
          value={formatPaisa(earnings.week.earningsPaisa)}
          hint={`${earnings.week.jobs} jobs`}
        />
        <Stat
          label="This month"
          value={formatPaisa(earnings.month.earningsPaisa)}
          hint={`${earnings.month.jobs} jobs`}
        />
        <Stat
          label="Pending payout"
          value={formatPaisa(earnings.pendingPayout.earningsPaisa)}
          hint={`${earnings.pendingPayout.jobs} jobs`}
        />
      </dl>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Totals</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-600">Total paid by customers</dt>
            <dd className="font-medium text-ink-900">{formatPaisa(earnings.allTime.grossPaisa)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-600">Platform commission</dt>
            <dd className="text-ink-700">−{formatPaisa(earnings.allTime.commissionPaisa)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-ink-200 pt-2">
            <dt className="font-semibold text-ink-900">Your total earnings</dt>
            <dd className="text-lg font-bold text-brand-700">
              {formatPaisa(earnings.allTime.earningsPaisa)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-600">Completed jobs</dt>
            <dd className="text-ink-900">{earnings.allTime.jobs}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="text-title text-ink-950">
          Recently completed jobs
        </h2>
        {recentJobs.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-200">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-ink-50 text-left">
                <tr>
                  <Th>Booking</Th>
                  <Th>Service</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Commission</Th>
                  <Th className="text-right">Your earnings</Th>
                  <Th>Payout</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-white">
                {recentJobs.map((job) => (
                  <tr key={job.id}>
                    <Td className="font-mono text-xs">{job.reference}</Td>
                    <Td>{job.service.name}</Td>
                    <Td className="text-ink-600">
                      {job.completedAt ? formatDate(job.completedAt) : '—'}
                    </Td>
                    <Td className="text-right">{formatPaisa(job.finalTotalPaisa ?? 0)}</Td>
                    <Td className="text-right text-ink-600">
                      −{formatPaisa(job.commissionPaisa ?? 0)}
                    </Td>
                    <Td className="text-right font-semibold text-brand-700">
                      {formatPaisa(job.providerEarningsPaisa ?? 0)}
                    </Td>
                    <Td>
                      {job.payoutItems.length > 0 ? (
                        <Badge tone="success">Included</Badge>
                      ) : (
                        <Badge tone="neutral">Outstanding</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="No completed jobs yet"
            description="Your earnings appear here once you complete your first job."
          />
        )}
      </section>

      <section aria-labelledby="payouts-heading">
        <h2 id="payouts-heading" className="text-title text-ink-950">
          Payouts
        </h2>
        {payouts.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {formatPaisa(payout.netPaisa)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)}
                    {payout.reference ? ` · Ref ${payout.reference}` : ''}
                  </p>
                </div>
                <Badge
                  tone={
                    payout.status === 'PAID'
                      ? 'success'
                      : payout.status === 'FAILED'
                        ? 'danger'
                        : 'warn'
                  }
                >
                  {payout.status === 'PAID'
                    ? 'Sent'
                    : payout.status === 'PROCESSING'
                      ? 'Processing'
                      : payout.status === 'FAILED'
                        ? 'Fail'
                        : 'Pending'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-sm text-ink-600">
              No payouts recorded yet. On cash bookings the money comes to you directly from the
              customer; the platform commission is accounted for here. Bank payouts are processed by
              the ops team.
            </p>
          </div>
        )}
      </section>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3.5 py-3 text-ink-800 ${className ?? ''}`}>{children}</td>;
}
