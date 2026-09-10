import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelative, cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Support', robots: { index: false, follow: false } };

const TABS = [
  { key: 'open', label: 'Khule', statuses: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] },
  { key: 'resolved', label: 'Hal ho gaye', statuses: ['RESOLVED', 'CLOSED'] },
] as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission('support:manage');
  const query = await searchParams;
  const view = TABS.find((tab) => tab.key === query.view) ?? TABS[0];

  const tickets = await prisma.supportTicket.findMany({
    where: { status: { in: [...view.statuses] } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: {
      requester: { select: { fullName: true, email: true, role: true } },
      assignee: { select: { fullName: true } },
      booking: { select: { id: true, reference: true, service: { select: { name: true } } } },
      _count: { select: { files: true } },
    },
  });

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Support tickets</h1>
        <p className="mt-1 text-sm text-ink-600">
          Customers aur providers ke masail. Jawab dene par ticket customer ke intezar par chala
          jata hai.
        </p>
      </header>

      <nav className="mt-5 flex gap-1.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/support?view=${tab.key}`}
            aria-current={view.key === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium',
              view.key === tab.key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {tickets.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/admin/support/${ticket.id}`}
                className="block rounded-2xl border border-ink-200 bg-white p-4 transition-shadow hover:shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{ticket.subject}</span>
                      <Badge tone="neutral">{ticket.requester.role.toLowerCase()}</Badge>
                      {ticket._count.files > 0 ? (
                        <Badge tone="neutral">{ticket._count.files} attachment</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-600">{ticket.description}</p>
                    <p className="mt-1.5 text-xs text-ink-500">
                      <span className="font-mono">{ticket.reference}</span> ·{' '}
                      {ticket.requester.fullName} ({ticket.requester.email})
                      {ticket.booking ? ` · ${ticket.booking.reference}` : ''} ·{' '}
                      {formatRelative(ticket.createdAt)}
                      {ticket.assignee ? ` · ${ticket.assignee.fullName} ke paas` : ' · unassigned'}
                    </p>
                  </div>
                  <Badge
                    tone={
                      ticket.status === 'OPEN'
                        ? 'danger'
                        : ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                          ? 'success'
                          : 'warn'
                    }
                  >
                    {ticket.status.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-5"
          title={view.key === 'open' ? 'Koi khula ticket nahi' : 'Koi hal shuda ticket nahi'}
        />
      )}
    </div>
  );
}
