import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { messageSchema, updateTicketSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStaff } from '@/lib/auth/rbac';
import { notify, NOTIFICATION_EVENTS } from '@/lib/notifications';
import { fileUrl } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

async function loadTicket(id: string, ctx: Awaited<ReturnType<typeof requireAuth>>) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      booking: { select: { id: true, reference: true, service: { select: { name: true } } } },
      assignee: { select: { id: true, fullName: true } },
      requester: { select: { id: true, fullName: true, email: true } },
      files: {
        where: { deletedAt: null },
        select: { id: true, originalName: true, mimeType: true },
      },
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
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.');
  if (ticket.requesterId !== ctx.user.id && !isStaff(ctx.role)) {
    throw new AppError('NOT_FOUND', 'Ticket not found.');
  }
  return ticket;
}

export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const ticket = await loadTicket(id, ctx);
  return ok({
    ...ticket,
    files: ticket.files.map((file) => ({ ...file, url: fileUrl(file.id) })),
  });
});

/** Post a reply. Both the requester and staff may write to the thread. */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const ticket = await loadTicket(id, ctx);
  const input = await parseJson(request, messageSchema);

  const conversation =
    ticket.conversations[0] ??
    (await prisma.conversation.create({
      data: { kind: 'SUPPORT_TICKET', ticketId: ticket.id, subject: ticket.subject },
    }));

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderUserId: ctx.user.id,
      body: input.body,
      attachmentId: input.attachmentId ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt },
  });

  // A staff reply moves the ticket to waiting-on-customer; a customer reply
  // reopens it for the team.
  const nextStatus = isStaff(ctx.role) ? 'WAITING_ON_CUSTOMER' : 'OPEN';
  if (ticket.status !== 'CLOSED') {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: nextStatus } });
  }

  const recipientId = isStaff(ctx.role) ? ticket.requesterId : (ticket.assigneeId ?? null);
  if (recipientId && recipientId !== ctx.user.id) {
    await notify({
      event: NOTIFICATION_EVENTS.SUPPORT_TICKET_UPDATE,
      userId: recipientId,
      title: `Support ticket update — ${ticket.reference}`,
      body: input.body.slice(0, 160),
      href: isStaff(ctx.role) ? `/account/support/${ticket.id}` : `/admin/support/${ticket.id}`,
      data: { ticketId: ticket.id },
    });
  }

  return ok({ id: message.id, createdAt: message.createdAt });
});

/** Staff-only: assign and change status. */
export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  if (!isStaff(ctx.role)) throw new AppError('FORBIDDEN', 'Only the support team can change this.');
  const { id } = await params;
  const input = await parseJson(request, updateTicketSchema);

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.status === 'RESOLVED' || input.status === 'CLOSED'
        ? { resolvedAt: new Date() }
        : {}),
    },
    select: { id: true, status: true, assigneeId: true, resolvedAt: true },
  });

  return ok(ticket);
});
