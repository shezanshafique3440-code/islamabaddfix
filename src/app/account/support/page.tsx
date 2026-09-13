import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Support', robots: { index: false, follow: false } };

const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'warn' | 'success' }
> = {
  OPEN: { label: 'Open', tone: 'info' },
  IN_PROGRESS: { label: 'Work under way', tone: 'warn' },
  WAITING_ON_CUSTOMER: { label: 'Waiting on your reply', tone: 'warn' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Band', tone: 'neutral' },
};

export default async function SupportPage() {
  const ctx = await requirePageAuth('/account/support');

  const tickets = await prisma.supportTicket.findMany({
    where: { requesterId: ctx.user.id },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      booking: { select: { id: true, reference: true, service: { select: { name: true } } } },
      _count: { select: { conversations: true } },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Support</h1>
          <p className="mt-1 text-sm text-ink-600">Your tickets and their status.</p>
        </div>
        <ButtonLink href="/account/support/new">+ New ticket</ButtonLink>
      </div>

      {tickets.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {tickets.map((ticket) => {
            const status = STATUS_LABELS[ticket.status] ?? {
              label: ticket.status,
              tone: 'neutral' as const,
            };
            return (
              <li key={ticket.id}>
                <Link
                  href={`/account/support/${ticket.id}`}
                  className="block rounded-2xl border border-ink-200 bg-surface p-4 transition-shadow hover:shadow-lift"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{ticket.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
                        {ticket.description}
                      </p>
                      <p className="mt-1.5 text-xs text-ink-500">
                        <span className="font-mono">{ticket.reference}</span>
                        {ticket.booking ? ` · ${ticket.booking.service.name}` : ''}
                        {' · '}
                        {formatRelative(ticket.createdAt)}
                      </p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          className="mt-6"
          title="No tickets"
          description="If there is a problem with a booking, quote or payment, open a ticket — our team will look into it."
          action={{ label: 'Open a ticket', href: '/account/support/new' }}
        />
      )}
    </div>
  );
}
