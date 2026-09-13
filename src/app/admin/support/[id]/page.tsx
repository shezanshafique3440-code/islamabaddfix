import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import { TicketThread } from '@/components/account/TicketThread';
import { AdminTicketControls } from '@/components/admin/AdminTicketControls';
import { fileUrl } from '@/lib/storage';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Support ticket',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function AdminTicketPage({ params }: Params) {
  const ctx = await requirePermission('support:manage');
  const { id } = await params;

  const [ticket, staff] = await Promise.all([
    prisma.supportTicket.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, email: true, phone: true, role: true } },
        assignee: { select: { id: true, fullName: true } },
        booking: { select: { id: true, reference: true, service: { select: { name: true } } } },
        files: { where: { deletedAt: null }, select: { id: true, originalName: true } },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              include: { sender: { select: { id: true, fullName: true, role: true } } },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  if (!ticket) notFound();

  const messages = ticket.conversations.flatMap((conversation) => conversation.messages);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/admin/support"
        className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
      >
        ← All tickets
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display-sm text-ink-950">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="font-mono">{ticket.reference}</span> ·{' '}
            {formatDateTime(ticket.createdAt)} · {ticket.requester.fullName} (
            {ticket.requester.role.toLowerCase()})
          </p>
          <p className="text-sm text-ink-600">
            {ticket.requester.email}
            {ticket.requester.phone ? ` · ${ticket.requester.phone}` : ''}
          </p>
          {ticket.booking ? (
            <p className="mt-1 text-sm">
              <Link
                href={`/account/bookings/${ticket.booking.id}`}
                className="text-brand-700 hover:underline"
              >
                {ticket.booking.reference} — {ticket.booking.service.name}
              </Link>
            </p>
          ) : null}
        </div>
        <Badge tone={ticket.status === 'OPEN' ? 'danger' : 'warn'}>
          {ticket.status.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      </header>

      <AdminTicketControls
        ticketId={ticket.id}
        status={ticket.status}
        assigneeId={ticket.assigneeId}
        currentUserId={ctx.user.id}
        staff={staff}
      />

      <section className="rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Original message
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-800">
          {ticket.description}
        </p>
        {ticket.files.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm">
            {ticket.files.map((file) => (
              <li key={file.id}>
                <a
                  href={fileUrl(file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  {file.originalName}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
  );
}
