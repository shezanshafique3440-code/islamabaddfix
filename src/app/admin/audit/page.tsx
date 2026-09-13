import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit log', robots: { index: false, follow: false } };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; page?: string }>;
}) {
  await requirePermission('audit:read');
  const query = await searchParams;
  const page = Number(query.page ?? 1) || 1;
  const perPage = 50;

  const where = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entity ? { entity: query.entity } : {}),
  };

  const [entries, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { actor: { select: { fullName: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Audit log</h1>
        <p className="mt-1 text-sm text-ink-600">
          Read-only. Provider approvals, refunds, role changes and every settings change are
          recorded here — nobody can delete this log.
        </p>
      </header>

      <div className="mt-5 flex flex-wrap gap-1.5">
        <Link
          href="/admin/audit"
          className={
            !query.action
              ? 'rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white'
              : 'rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50'
          }
        >
          Sab ({total})
        </Link>
        {actions.slice(0, 14).map((entry) => (
          <Link
            key={entry.action}
            href={`/admin/audit?action=${entry.action}`}
            className={
              query.action === entry.action
                ? 'rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50'
            }
          >
            {entry.action} ({entry._count._all})
          </Link>
        ))}
      </div>

      {entries.length > 0 ? (
        <>
          <ul className="mt-5 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                      <span className="text-xs text-ink-500">
                        {entry.entity}
                        {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ''}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-700">
                      {entry.actor
                        ? `${entry.actor.fullName} (${entry.actor.role.toLowerCase()})`
                        : 'System'}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata as object).length > 0 ? (
                      <pre className="mt-1.5 max-w-full overflow-x-auto rounded-lg bg-ink-50 p-2 font-mono text-[0.6875rem] text-ink-600">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav aria-label="Pagination" className="mt-5 flex justify-center gap-2">
              {Array.from({ length: Math.min(totalPages, 10) }).map((_, index) => {
                const target = index + 1;
                const params = new URLSearchParams();
                if (query.action) params.set('action', query.action);
                params.set('page', String(target));
                return (
                  <Link
                    key={target}
                    href={`/admin/audit?${params.toString()}`}
                    className={
                      target === page
                        ? 'flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white'
                        : 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-ink-200 px-3 text-sm text-ink-700 hover:bg-ink-50'
                    }
                  >
                    {target}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState className="mt-5" title="No audit entries" />
      )}
    </div>
  );
}

function toneFor(action: string): 'danger' | 'warn' | 'success' | 'neutral' {
  if (action.includes('refund') || action.includes('suspend') || action.includes('reject')) {
    return 'danger';
  }
  if (action.includes('approved') || action.includes('reinstated')) return 'success';
  if (action.includes('settings') || action.includes('commission') || action.includes('role')) {
    return 'warn';
  }
  return 'neutral';
}
