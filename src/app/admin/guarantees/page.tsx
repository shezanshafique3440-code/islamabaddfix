import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { GUARANTEE_STATUS_LABELS } from '@/lib/bookings/disputes';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatRelative } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Guarantee claims',
  robots: { index: false, follow: false },
};

const OPEN = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REVISIT_SCHEDULED'] as const;

export default async function AdminGuaranteesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission('guarantee:decide');
  const query = await searchParams;
  const showClosed = query.view === 'closed';

  const claims = await prisma.guaranteeClaim.findMany({
    where: showClosed ? { status: { notIn: [...OPEN] } } : { status: { in: [...OPEN] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      booking: {
        select: {
          reference: true,
          completedAt: true,
          guaranteeExpiresAt: true,
          guaranteeDays: true,
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
        <h1 className="text-display-sm text-ink-950">Guarantee claims</h1>
        <p className="mt-1 text-sm text-ink-600">
          Every claim is reviewed — the guarantee does not mean a free re-visit in every case.
        </p>
      </header>

      <nav className="mt-5 flex gap-1.5">
        <Link
          href="/admin/guarantees"
          className={
            !showClosed
              ? 'rounded-lg bg-contrast px-3 py-2 text-sm font-medium text-contrast-fg'
              : 'rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100'
          }
        >
          Open
        </Link>
        <Link
          href="/admin/guarantees?view=closed"
          className={
            showClosed
              ? 'rounded-lg bg-contrast px-3 py-2 text-sm font-medium text-contrast-fg'
              : 'rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100'
          }
        >
          Resolved
        </Link>
      </nav>

      {claims.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {claims.map((claim) => (
            <li key={claim.id}>
              <Link
                href={`/admin/guarantees/${claim.id}`}
                className="block rounded-2xl border border-ink-200 bg-surface p-4 transition-shadow hover:shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-500">{claim.reference}</span>
                      {claim._count.files > 0 ? (
                        <Badge tone="neutral">{claim._count.files} evidence</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-800">{claim.description}</p>
                    <p className="mt-1.5 text-xs text-ink-500">
                      {claim.booking.reference} · {claim.booking.service.name} ·{' '}
                      {claim.booking.customer.fullName}
                      {claim.booking.provider ? ` · ${claim.booking.provider.businessName}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      Work completed{' '}
                      {claim.booking.completedAt ? formatDate(claim.booking.completedAt) : '—'} ·
                      Guarantee until{' '}
                      {claim.booking.guaranteeExpiresAt
                        ? formatDate(claim.booking.guaranteeExpiresAt)
                        : '—'}{' '}
                      tak · Claim {formatRelative(claim.createdAt)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      claim.status === 'REJECTED'
                        ? 'danger'
                        : claim.status === 'RESOLVED'
                          ? 'success'
                          : 'warn'
                    }
                  >
                    {GUARANTEE_STATUS_LABELS[claim.status]}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="mt-5" title={showClosed ? 'No resolved claims' : 'No open claims'} />
      )}
    </div>
  );
}
