import { z } from 'zod';
import { created, ok, parseJson, parseQuery, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { createTicketSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ticketReference } from '@/lib/ids';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { notifyAdmins, NOTIFICATION_EVENTS } from '@/lib/notifications';
import { isStaff } from '@/lib/auth/rbac';

const querySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  /** Staff only; ignored for everyone else. */
  all: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = route(async (request) => {
  const ctx = await requireAuth();
  const query = parseQuery(request, querySchema);
  const seeAll = query.all && isStaff(ctx.role);

  const where = {
    ...(seeAll ? {} : { requesterId: ctx.user.id }),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        booking: { select: { id: true, reference: true, service: { select: { name: true } } } },
        assignee: { select: { id: true, fullName: true } },
        ...(seeAll ? { requester: { select: { id: true, fullName: true, email: true } } } : {}),
        _count: { select: { files: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return ok(items, {
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  });
});

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.supportTicket, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, createTicketSchema);

  // A ticket may only be attached to a booking the requester is party to.
  if (input.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: { customerId: true, providerId: true },
    });
    const isParty =
      booking !== null &&
      (booking.customerId === ctx.user.id ||
        (ctx.providerId !== undefined && booking.providerId === ctx.providerId));
    if (!isParty) throw new AppError('NOT_FOUND', 'Booking not found.');
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const createdTicket = await tx.supportTicket.create({
      data: {
        reference: ticketReference(),
        requesterId: ctx.user.id,
        bookingId: input.bookingId ?? null,
        subject: input.subject,
        description: input.description,
      },
    });
    if (input.fileIds?.length) {
      await tx.uploadedFile.updateMany({
        where: {
          id: { in: input.fileIds },
          ownerId: ctx.user.id,
          purpose: 'SUPPORT_ATTACHMENT',
          ticketId: null,
          deletedAt: null,
        },
        data: { ticketId: createdTicket.id },
      });
    }
    await tx.conversation.create({
      data: {
        kind: 'SUPPORT_TICKET',
        ticketId: createdTicket.id,
        bookingId: input.bookingId ?? null,
        subject: createdTicket.subject,
        participants: { create: { userId: ctx.user.id } },
      },
    });
    return createdTicket;
  });

  await notifyAdmins({
    event: NOTIFICATION_EVENTS.SUPPORT_TICKET_UPDATE,
    title: `New support ticket — ${ticket.reference}`,
    body: ticket.subject,
    href: `/admin/support/${ticket.id}`,
    data: { ticketId: ticket.id },
  });

  return created({ id: ticket.id, reference: ticket.reference, status: ticket.status });
});
