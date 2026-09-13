import Link from 'next/link';
import type { BookingSummary } from '@/lib/bookings/queries';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { formatPaisa } from '@/lib/money';
import { formatTime } from '@/lib/utils';

/**
 * Today's jobs as a timeline.
 *
 * Time is the anchor — a technician plans their day by "10:00 AC service G-10",
 * which is exactly how the brief describes it — so the slot sits in its own
 * column and the rest hangs off it.
 */
export function TodaySchedule({ jobs }: { jobs: BookingSummary[] }) {
  return (
    <ol className="space-y-3">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link
            href={`/provider/jobs/${job.id}`}
            className="flex gap-4 rounded-2xl border border-ink-200 bg-surface p-4 transition-shadow hover:shadow-lift"
          >
            <div className="w-16 shrink-0 border-r border-ink-100 pr-3">
              <p className="text-sm font-bold tracking-tight text-ink-950">
                {job.scheduledFor ? formatTime(job.scheduledFor) : 'Right now'}
              </p>
              {job.isEmergency ? (
                <p className="mt-0.5 text-[0.625rem] font-bold uppercase text-alert-600">
                  Emergency
                </p>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ServiceIconTile iconKey={job.category.iconKey} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{job.serviceName}</p>
                <p className="text-xs font-medium text-ink-600">{job.zoneName}</p>
                <p className="mt-1 line-clamp-1 text-xs text-ink-500">{job.problemDescription}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge status={job.status} label={job.statusLabel} />
                {job.approvedTotalPaisa !== null ? (
                  <span className="text-sm font-semibold text-ink-900">
                    {formatPaisa(job.approvedTotalPaisa)}
                  </span>
                ) : (
                  <Badge tone="warn">Quote pending</Badge>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
