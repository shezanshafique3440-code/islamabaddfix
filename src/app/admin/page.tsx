import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { getOverviewMetrics, getDailySeries, getCategoryBreakdown } from '@/lib/analytics';
import { channelStatus } from '@/lib/notifications';
import { paymentProviderStatus } from '@/lib/payments';
import { aiStatus } from '@/lib/ai';
import { mapsStatus } from '@/lib/maps';
import { integrations } from '@/lib/env';
import { formatPaisa } from '@/lib/money';
import { MetricCard } from '@/components/admin/MetricCard';
import { BookingsChart } from '@/components/admin/BookingsChart';
import { IntegrationStatusList } from '@/components/admin/IntegrationStatusList';

export const metadata: Metadata = {
  title: 'Admin dashboard',
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  await requirePermission('analytics:read');

  const [metrics, series, categories] = await Promise.all([
    getOverviewMetrics(),
    getDailySeries(14),
    getCategoryBreakdown(30),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-display-sm text-ink-950">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-600">The whole marketplace at a glance.</p>
      </header>

      {/* Queues first: these are the things that need a human today. */}
      {metrics.queues.pendingProviders > 0 ||
      metrics.quality.openDisputes > 0 ||
      metrics.queues.unassignedBookings > 0 ||
      metrics.quality.openGuaranteeClaims > 0 ? (
        <section
          aria-labelledby="queues-heading"
          className="rounded-2xl border border-warn-200 bg-warn-50 p-5"
        >
          <h2 id="queues-heading" className="text-[0.9375rem] font-semibold text-warn-700">
            Needs your attention
          </h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {metrics.queues.pendingProviders > 0 ? (
              <QueueLink
                href="/admin/providers?status=PENDING_VERIFICATION"
                count={metrics.queues.pendingProviders}
                label="providers verification ke liye"
              />
            ) : null}
            {metrics.queues.unassignedBookings > 0 ? (
              <QueueLink
                href="/admin/bookings?status=PENDING"
                count={metrics.queues.unassignedBookings}
                label="bookings bina technician"
              />
            ) : null}
            {metrics.quality.openDisputes > 0 ? (
              <QueueLink
                href="/admin/disputes"
                count={metrics.quality.openDisputes}
                label="khule disputes"
              />
            ) : null}
            {metrics.quality.openGuaranteeClaims > 0 ? (
              <QueueLink
                href="/admin/guarantees"
                count={metrics.quality.openGuaranteeClaims}
                label="guarantee claims"
              />
            ) : null}
            {metrics.queues.openTickets > 0 ? (
              <QueueLink
                href="/admin/support"
                count={metrics.queues.openTickets}
                label="support tickets"
              />
            ) : null}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-title text-ink-950">
          Today
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Bookings today" value={String(metrics.bookings.today)} />
          <MetricCard label="Completed today" value={String(metrics.bookings.completedToday)} />
          <MetricCard
            label="Revenue today"
            value={formatPaisa(metrics.revenue.todayGrossPaisa)}
            hint={`Commission ${formatPaisa(metrics.revenue.todayCommissionPaisa)}`}
          />
          <MetricCard label="Cancelled today" value={String(metrics.bookings.cancelledToday)} />
        </dl>
      </section>

      <section aria-labelledby="month-heading">
        <h2 id="month-heading" className="text-title text-ink-950">
          Last 30 days
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Completed jobs" value={String(metrics.bookings.completedThisMonth)} />
          <MetricCard label="Gross revenue" value={formatPaisa(metrics.revenue.monthGrossPaisa)} />
          <MetricCard
            label="Platform commission"
            value={formatPaisa(metrics.revenue.monthCommissionPaisa)}
          />
          <MetricCard
            label="Average order value"
            value={
              metrics.revenue.averageOrderValuePaisa !== null
                ? formatPaisa(metrics.revenue.averageOrderValuePaisa)
                : '—'
            }
            hint={
              metrics.revenue.averageOrderValuePaisa === null ? 'No completed bookings' : undefined
            }
          />
        </dl>
      </section>

      <section
        aria-labelledby="chart-heading"
        className="rounded-2xl border border-ink-200 bg-white p-5"
      >
        <h2 id="chart-heading" className="text-[0.9375rem] font-semibold text-ink-900">
          Last 14 days
        </h2>
        <div className="mt-4">
          <BookingsChart data={series} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="network-heading">
          <h2 id="network-heading" className="text-title text-ink-950">
            Network
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard label="Verified providers" value={String(metrics.providers.verified)} />
            <MetricCard
              label="Verification pending"
              value={String(metrics.providers.pendingVerification)}
            />
            <MetricCard label="Customers" value={String(metrics.users.customers)} />
            <MetricCard label="New users (7 days)" value={String(metrics.users.newThisWeek)} />
          </dl>
        </section>

        <section aria-labelledby="quality-heading">
          <h2 id="quality-heading" className="text-title text-ink-950">
            Quality
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard
              label="Average rating"
              value={
                metrics.quality.averageRating !== null
                  ? `${metrics.quality.averageRating.toFixed(2)} ★`
                  : '—'
              }
              hint={
                metrics.quality.ratingCount > 0
                  ? `${metrics.quality.ratingCount} reviews`
                  : 'No reviews'
              }
            />
            <MetricCard
              label="Cancellation rate"
              value={formatRate(metrics.quality.cancellationRate)}
            />
            <MetricCard label="Dispute rate" value={formatRate(metrics.quality.disputeRate)} />
            <MetricCard
              label="Provider response rate"
              value={formatRate(metrics.quality.providerResponseRate)}
            />
          </dl>
        </section>
      </div>

      <section
        aria-labelledby="categories-heading"
        className="rounded-2xl border border-ink-200 bg-white p-5"
      >
        <h2 id="categories-heading" className="text-[0.9375rem] font-semibold text-ink-900">
          Top categories (30 days)
        </h2>
        {categories.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {categories.slice(0, 8).map((category) => {
              const max = categories[0]?.bookings ?? 1;
              return (
                <li key={category.categorySlug}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-800">{category.categoryName}</span>
                    <span className="shrink-0 text-ink-600">
                      {category.bookings} bookings · {formatPaisa(category.grossPaisa)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(category.bookings / max) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-500">No bookings in this period.</p>
        )}
      </section>

      <section aria-labelledby="integrations-heading">
        <h2 id="integrations-heading" className="text-title text-ink-950">
          Integrations
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Anything not configured is shown clearly — no feature fails silently.
        </p>
        <div className="mt-4">
          <IntegrationStatusList
            notifications={channelStatus()}
            payments={paymentProviderStatus()}
            ai={aiStatus()}
            maps={mapsStatus()}
            whatsapp={{ ...integrations.whatsapp }}
            voice={{ ...integrations.voice }}
            calling={{ ...integrations.calling }}
            cron={{ ...integrations.cron }}
            storage={{ ...integrations.storage }}
          />
        </div>
      </section>
    </div>
  );
}

function QueueLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-ink-900 shadow-sm hover:bg-ink-50"
      >
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-alert-500 px-1.5 text-xs font-bold text-white">
          {count}
        </span>
        {label}
      </Link>
    </li>
  );
}

/** Rates render as an em dash when there is no denominator to divide by. */
function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}
