import Link from 'next/link';
import type { BookingSummary } from '@/lib/bookings/queries';
import { StatusBadge, Badge, DemoBadge } from '@/components/ui/Badge';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { formatPaisa } from '@/lib/money';
import { formatDateTime, formatRelative } from '@/lib/utils';

/**
 * Booking list, shared by the customer dashboard and the provider job list.
 *
 * Each row leads with the one thing the reader wants: what the job is, where,
 * when, and whether it needs their attention right now.
 */
export function BookingList({
  bookings,
  pagination,
  basePath,
  hrefPrefix = '/account/bookings',
}: {
  bookings: BookingSummary[];
  pagination?: { page: number; totalPages: number };
  basePath?: string;
  hrefPrefix?: string;
}) {
  return (
    <div>
      <ul className="space-y-3">
        {bookings.map((booking) => {
          const needsAction = booking.status === 'QUOTE_PENDING';
          return (
            <li key={booking.id}>
              <Link
                href={`${hrefPrefix}/${booking.id}`}
                className="block rounded-2xl border border-ink-200 bg-surface p-4 transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start gap-3.5">
                  <ServiceIconTile iconKey={booking.category.iconKey} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.9375rem] font-semibold text-ink-900">
                        {booking.serviceName}
                      </span>
                      {booking.isEmergency ? <Badge tone="danger">🚨 Emergency</Badge> : null}
                      {booking.isDemo ? <DemoBadge /> : null}
                    </div>

                    <p className="mt-0.5 line-clamp-1 text-sm text-ink-600">
                      {booking.problemDescription}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      <span className="font-mono">{booking.reference}</span>
                      <span>{booking.zoneName}</span>
                      {booking.scheduledFor ? (
                        <span>{formatDateTime(booking.scheduledFor)}</span>
                      ) : (
                        <span>{formatRelative(booking.createdAt)}</span>
                      )}
                      {booking.provider ? <span>{booking.provider.businessName}</span> : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={booking.status} label={booking.statusLabel} />
                    {booking.finalTotalPaisa !== null ? (
                      <span className="text-sm font-semibold text-ink-900">
                        {formatPaisa(booking.finalTotalPaisa)}
                      </span>
                    ) : booking.approvedTotalPaisa !== null ? (
                      <span className="text-sm text-ink-600">
                        {formatPaisa(booking.approvedTotalPaisa)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Anything demanding the reader's attention gets its own line. */}
                {needsAction ? (
                  <p className="mt-3 rounded-lg bg-warn-50 px-3 py-2 text-xs font-medium text-warn-700">
                    Your quote has arrived — approve or reject it.
                  </p>
                ) : null}
                {booking.status === 'COMPLETED' && !booking.hasReview ? (
                  <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">
                    A review is still pending — your rating helps others.
                  </p>
                ) : null}
                {booking.hasDispute ? (
                  <p className="mt-3 rounded-lg bg-alert-50 px-3 py-2 text-xs font-medium text-alert-700">
                    There is an open dispute on this booking.
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {pagination && pagination.totalPages > 1 && basePath ? (
        <nav aria-label="Pagination" className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }).map((_, index) => {
            const target = index + 1;
            const separator = basePath.includes('?') ? '&' : '?';
            return (
              <Link
                key={target}
                href={`${basePath}${separator}page=${target}`}
                aria-current={target === pagination.page ? 'page' : undefined}
                className={
                  target === pagination.page
                    ? 'flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white dark:text-brand-50'
                    : 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-ink-200 px-3 text-sm text-ink-700 hover:bg-ink-50'
                }
              >
                {target}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
