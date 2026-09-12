import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import {
  getCategoryBreakdown,
  getDailySeries,
  getProviderPerformance,
  getRetentionMetrics,
  getZoneBreakdown,
} from '@/lib/analytics';
import { BookingsChart } from '@/components/admin/BookingsChart';
import { MetricCard } from '@/components/admin/MetricCard';
import { Rating } from '@/components/ui/Rating';
import { formatPaisa } from '@/lib/money';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false, follow: false } };

const RANGES = [7, 30, 90] as const;

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePermission('analytics:read');
  const query = await searchParams;
  const days = RANGES.find((range) => range === Number(query.days)) ?? 30;

  const [series, categories, zones, providers, retention] = await Promise.all([
    getDailySeries(days),
    getCategoryBreakdown(days),
    getZoneBreakdown(days),
    getProviderPerformance(15),
    getRetentionMetrics(),
  ]);

  const totals = series.reduce(
    (acc, point) => ({
      bookings: acc.bookings + point.bookings,
      completed: acc.completed + point.completed,
      cancelled: acc.cancelled + point.cancelled,
      gross: acc.gross + point.grossPaisa,
      commission: acc.commission + point.commissionPaisa,
    }),
    { bookings: 0, completed: 0, cancelled: 0, gross: 0, commission: 0 },
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Analytics</h1>
          <p className="mt-1 text-sm text-ink-600">Pichle {days} din ka data.</p>
        </div>
        {/* Time-range control sits in one row above the charts. */}
        <nav aria-label="Time range" className="flex gap-1.5">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/admin/analytics?days=${range}`}
              aria-current={days === range ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                days === range
                  ? 'bg-ink-900 text-white'
                  : 'border border-ink-200 text-ink-600 hover:bg-ink-50',
              )}
            >
              {range} din
            </Link>
          ))}
        </nav>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Bookings" value={String(totals.bookings)} />
        <MetricCard label="Mukammal" value={String(totals.completed)} />
        <MetricCard label="Cancelled" value={String(totals.cancelled)} />
        <MetricCard label="Gross revenue" value={formatPaisa(totals.gross)} />
        <MetricCard label="Commission" value={formatPaisa(totals.commission)} />
      </dl>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Rozana trend</h2>
        <div className="mt-4">
          <BookingsChart data={series} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownPanel
          title="Category ke hisaab se"
          rows={categories.map((category) => ({
            label: category.categoryName,
            primary: category.bookings,
            secondary: `${category.completed} mukammal · ${formatPaisa(category.grossPaisa)}`,
          }))}
        />
        <BreakdownPanel
          title="Area ke hisaab se"
          rows={zones.map((zone) => ({
            label: zone.zoneName,
            primary: zone.bookings,
            secondary: formatPaisa(zone.grossPaisa),
          }))}
        />
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Customer retention</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          <MetricCard label="Customers" value={String(retention.totalCustomers)} />
          <MetricCard label="Repeat customers" value={String(retention.repeatCustomers)} />
          <MetricCard
            label="Repeat rate"
            value={
              retention.repeatRate !== null ? `${(retention.repeatRate * 100).toFixed(1)}%` : '—'
            }
            hint={retention.repeatRate === null ? 'Koi mukammal booking nahi' : undefined}
          />
          <MetricCard label="Active (30 din)" value={String(retention.activeCustomers)} />
        </dl>
      </section>

      <section aria-labelledby="providers-heading">
        <h2 id="providers-heading" className="text-title text-ink-950">
          Provider performance
        </h2>
        {providers.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-200">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Provider performance</caption>
              <thead className="bg-ink-50 text-left">
                <tr>
                  <Th>Provider</Th>
                  <Th className="text-right">Mukammal</Th>
                  <Th className="text-right">Cancelled</Th>
                  <Th>Rating</Th>
                  <Th className="text-right">Response rate</Th>
                  <Th className="text-right">Avg jawab</Th>
                  <Th className="text-right">Gross</Th>
                  <Th className="text-right">Kamai</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-white">
                {providers.map((provider) => (
                  <tr key={provider.providerId}>
                    <Td>
                      <Link
                        href={`/admin/providers/${provider.providerId}`}
                        className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {provider.businessName}
                      </Link>
                    </Td>
                    <Td className="text-right text-ink-900">{provider.completedJobs}</Td>
                    <Td className="text-right text-ink-600">{provider.cancelledJobs}</Td>
                    <Td>
                      <Rating
                        value={provider.ratingAverage}
                        count={provider.ratingCount}
                        size="sm"
                        showEmpty={false}
                      />
                    </Td>
                    <Td className="text-right text-ink-700">
                      {(provider.responseRate * 100).toFixed(0)}%
                    </Td>
                    <Td className="text-right text-ink-600">
                      {provider.avgResponseMinutes !== null
                        ? `${provider.avgResponseMinutes} min`
                        : '—'}
                    </Td>
                    <Td className="text-right text-ink-900">{formatPaisa(provider.grossPaisa)}</Td>
                    <Td className="text-right font-medium text-brand-700">
                      {formatPaisa(provider.earningsPaisa)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-500">Abhi koi verified provider nahi.</p>
        )}
      </section>
    </div>
  );
}

function BreakdownPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; primary: number; secondary: string }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.primary));
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="text-[0.9375rem] font-semibold text-ink-900">{title}</h2>
      {rows.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {rows.slice(0, 12).map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink-800">{row.label}</span>
                <span className="shrink-0 text-xs text-ink-600">
                  {row.primary} · {row.secondary}
                </span>
              </div>
              {/* Single-series magnitude: one hue, length carries the value. */}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(row.primary / max) * 100}%`, backgroundColor: '#0f8663' }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-500">Is arse mein koi data nahi.</p>
      )}
    </section>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
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
  return <td className={`px-3.5 py-3 ${className ?? ''}`}>{children}</td>;
}
