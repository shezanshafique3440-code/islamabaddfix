import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { DISPUTE_REASON_LABELS, DISPUTE_STATUS_LABELS } from '@/lib/bookings/disputes';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisa } from '@/lib/money';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Disputes', robots: { index: false, follow: false } };

const OPEN_STATUSES = ['OPEN', 'UNDER_REVIEW', 'AWAITING_CUSTOMER', 'AWAITING_PROVIDER'] as const;

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission('dispute:resolve');
  const query = await searchParams;
  const showResolved = query.view === 'resolved';

  const disputes = await prisma.dispute.findMany({
    where: showResolved
      ? { status: { notIn: [...OPEN_STATUSES] } }
      : { status: { in: [...OPEN_STATUSES] } },
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
    include: {
      booking: {
        select: {
          reference: true,
          finalTotalPaisa: true,
          service: { select: { name: true } },
          customer: { select: { fullName: true } },
          provider: { select: { businessName: true } },
        },
      },
      _count: { select: { files: true } },
    },
  });

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Disputes</h1>
        <p className="mt-1 text-sm text-ink-600">
          Dono taraf ki maloomat dekh kar faisla karein. Har faisla audit log mein jata hai.
        </p>
      </header>

      <nav className="mt-5 flex gap-1.5">
        <Link
          href="/admin/disputes"
          aria-current={!showResolved ? 'page' : undefined}
          className={
            !showResolved
              ? 'rounded-lg bg-ink-900 px-3 py-2 text-sm font-medium text-white'
              : 'rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100'
          }
        >
          Khule
        </Link>
        <Link
          href="/admin/disputes?view=resolved"
          aria-current={showResolved ? 'page' : undefined}
          className={
            showResolved
              ? 'rounded-lg bg-ink-900 px-3 py-2 text-sm font-medium text-white'
              : 'rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100'
          }
        >
          Hal ho gaye
        </Link>
      </nav>

      {disputes.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {disputes.map((dispute) => (
            <li key={dispute.id}>
              <Link
                href={`/admin/disputes/${dispute.id}`}
                className="block rounded-2xl border border-ink-200 bg-white p-4 transition-shadow hover:shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-500">{dispute.reference}</span>
                      <Badge tone="danger">
                        {DISPUTE_REASON_LABELS[dispute.reason].en}
                      </Badge>
                      {dispute._count.files > 0 ? (
                        <Badge tone="neutral">{dispute._count.files} evidence</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-800">
                      {dispute.description}
                    </p>
                    <p className="mt-1.5 text-xs text-ink-500">
                      {dispute.booking.reference} · {dispute.booking.service.name} ·{' '}
                      {dispute.booking.customer.fullName}
                      {dispute.booking.provider ? ` vs ${dispute.booking.provider.businessName}` : ''}
                      {' · '}
                      {formatRelative(dispute.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge
                      tone={
                        dispute.status === 'OPEN'
                          ? 'danger'
                          : dispute.status.startsWith('RESOLVED')
                            ? 'success'
                            : 'warn'
                      }
                    >
                      {DISPUTE_STATUS_LABELS[dispute.status].en}
                    </Badge>
                    {dispute.booking.finalTotalPaisa ? (
                      <span className="text-sm font-medium text-ink-900">
                        {formatPaisa(dispute.booking.finalTotalPaisa)}
                      </span>
                    ) : null}
                    {dispute.refundPaisa > 0 ? (
                      <span className="text-xs text-brand-700">
                        Refunded {formatPaisa(dispute.refundPaisa)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-5"
          title={showResolved ? 'Koi hal shuda dispute nahi' : 'Koi khula dispute nahi'}
          description={showResolved ? undefined : 'Achi khabar — sab theek chal raha hai.'}
        />
      )}
    </div>
  );
}
