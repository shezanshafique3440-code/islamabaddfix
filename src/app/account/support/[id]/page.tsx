import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { isStaff } from '@/lib/auth/rbac';
import { Badge } from '@/components/ui/Badge';
import { TicketThread } from '@/components/account/TicketThread';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Support ticket',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function TicketPage({ params }: Params) {
  const ctx = await requirePageAuth('/account/support');
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      booking: { select: { id: true, reference: true, service: { select: { name: true } } } },
      assignee: { select: { fullName: true } },
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, fullName: true, role: true } } },
          },
        },
      },
    },
  });

  // A ticket that is not yours reads as absent, not forbidden.
  if (!ticket || (ticket.requesterId !== ctx.user.id && !isStaff(ctx.role))) notFound();

  const messages = ticket.conversations.flatMap((conversation) => conversation.messages);

  return (
    <div className="max-w-3xl">
      <Link
        href="/account/support"
        className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
      >
        ← All tickets
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display-sm text-ink-950">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="font-mono">{ticket.reference}</span>
            {' · '}
            {formatDateTime(ticket.createdAt)}
            {ticket.booking ? (
              <>
                {' · '}
                <Link
                  href={`/account/bookings/${ticket.booking.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {ticket.booking.reference}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Badge
          tone={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'success' : 'info'}
        >
          {ticket.status}
        </Badge>
      </div>

      <div className="mt-5 rounded-2xl border border-ink-200 bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Your message</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-800">
          {ticket.description}
        </p>
      </div>

      <div className="mt-5">
        <TicketThread
          ticketId={ticket.id}
          currentUserId={ctx.user.id}
          closed={ticket.status === 'CLOSED'}
          messages={messages.map((message) => ({
            id: message.id,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
            senderName: message.sender?.fullName ?? 'Islamabad Fix',
            isStaff: message.sender?.role === 'ADMIN' || message.sender?.role === 'SUPER_ADMIN',
            isMine: message.sender?.id === ctx.user.id,
          }))}
        />
      </div>
    </div>
  );
}
