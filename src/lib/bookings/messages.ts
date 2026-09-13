import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { isStaff } from '../auth/rbac';
import { notify, NOTIFICATION_EVENTS } from '../notifications';

/**
 * Messaging on a booking.
 *
 * A marketplace where the customer and the technician cannot talk to each
 * other is a marketplace where they exchange phone numbers and leave. The
 * thread lives on the booking so the whole exchange stays attached to the job
 * it is about, and so ops can read it when a dispute is raised.
 *
 * Who may take part is deliberately narrow: the booking's customer, the
 * **assigned** provider, and staff. A provider who has only been *offered* the
 * job is not in the thread — the privacy staging exists precisely so that
 * somebody who has not committed to turning up cannot ask for the address.
 */

const MAX_BODY = 2000;

export interface BookingMessageView {
  id: string;
  body: string;
  createdAt: Date;
  systemAuthor: string | null;
  sender: { id: string; fullName: string; isYou: boolean } | null;
  attachment: { id: string; url: string; mimeType: string; originalName: string } | null;
}

interface Party {
  customerId: string;
  providerId: string | null;
  providerUserId: string | null;
  status: string;
  reference: string;
}

async function loadBooking(bookingId: string): Promise<Party> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: {
      customerId: true,
      providerId: true,
      status: true,
      reference: true,
      provider: { select: { userId: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  return {
    customerId: booking.customerId,
    providerId: booking.providerId,
    providerUserId: booking.provider?.userId ?? null,
    status: booking.status,
    reference: booking.reference,
  };
}

/** Deny by default; each allow is a party to this specific job. */
function assertParticipant(
  booking: Party,
  viewer: { userId: string; role: Role; providerId?: string },
): 'CUSTOMER' | 'PROVIDER' | 'ADMIN' {
  if (isStaff(viewer.role)) return 'ADMIN';
  if (booking.customerId === viewer.userId) return 'CUSTOMER';
  if (viewer.providerId && booking.providerId === viewer.providerId) return 'PROVIDER';
  // 404 rather than 403: whether this booking exists is not this caller's business.
  throw new AppError('NOT_FOUND', 'Booking not found.');
}

/**
 * The thread for a booking, created on first use.
 *
 * Participants are added as they become real: the customer always, the
 * provider once assigned. Staff read through their own permission rather than
 * by being joined to every conversation in the system.
 */
export async function getOrCreateBookingThread(bookingId: string): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: { kind: 'BOOKING', bookingId },
    select: { id: true },
  });

  const booking = await loadBooking(bookingId);
  const participantIds = [booking.customerId, booking.providerUserId].filter(
    (id): id is string => id !== null,
  );

  if (existing) {
    // The provider may have been assigned after the thread was opened.
    await prisma.conversationParticipant.createMany({
      data: participantIds.map((userId) => ({ conversationId: existing.id, userId })),
      skipDuplicates: true,
    });
    return existing.id;
  }

  const created = await prisma.conversation.create({
    data: {
      kind: 'BOOKING',
      bookingId,
      subject: `Booking ${booking.reference}`,
      participants: { create: participantIds.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });
  return created.id;
}

export async function listBookingMessages(
  bookingId: string,
  viewer: { userId: string; role: Role; providerId?: string },
): Promise<{ conversationId: string; messages: BookingMessageView[] }> {
  const booking = await loadBooking(bookingId);
  assertParticipant(booking, viewer);

  const conversationId = await getOrCreateBookingThread(bookingId);
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: {
      sender: { select: { id: true, fullName: true } },
      attachment: { select: { id: true, mimeType: true, originalName: true } },
    },
  });

  return {
    conversationId,
    messages: rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      systemAuthor: row.systemAuthor,
      sender: row.sender
        ? {
            id: row.sender.id,
            // Only the first name reaches the other party, matching reviews.
            fullName: row.sender.fullName.split(' ')[0] ?? row.sender.fullName,
            isYou: row.sender.id === viewer.userId,
          }
        : null,
      attachment: row.attachment
        ? {
            id: row.attachment.id,
            url: `/api/files/${row.attachment.id}`,
            mimeType: row.attachment.mimeType,
            originalName: row.attachment.originalName,
          }
        : null,
    })),
  };
}

export async function sendBookingMessage(params: {
  bookingId: string;
  viewer: { userId: string; role: Role; providerId?: string };
  body: string;
  attachmentId?: string | null;
}): Promise<BookingMessageView> {
  const body = params.body.trim();
  if (body.length === 0 && !params.attachmentId) {
    throw new AppError('VALIDATION_ERROR', 'A message cannot be empty.');
  }
  if (body.length > MAX_BODY) {
    throw new AppError(
      'VALIDATION_ERROR',
      `A message cannot be longer than ${MAX_BODY} characters.`,
    );
  }

  const booking = await loadBooking(params.bookingId);
  const role = assertParticipant(booking, params.viewer);

  // A cancelled job has nothing left to arrange. Completed ones stay open:
  // the guarantee window and any dispute both need this thread.
  if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
    throw new AppError('CONFLICT', 'This booking is closed, so no new messages can be sent.');
  }

  // An attachment must be the sender's own, and must belong to this booking —
  // otherwise a message id becomes a way to surface somebody else's file.
  if (params.attachmentId) {
    const file = await prisma.uploadedFile.findFirst({
      where: {
        id: params.attachmentId,
        ownerId: params.viewer.userId,
        bookingId: params.bookingId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!file) throw new AppError('NOT_FOUND', 'Attachment not found.');
  }

  const conversationId = await getOrCreateBookingThread(params.bookingId);
  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderUserId: params.viewer.userId,
        body,
        attachmentId: params.attachmentId ?? null,
      },
      include: {
        sender: { select: { id: true, fullName: true } },
        attachment: { select: { id: true, mimeType: true, originalName: true } },
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    }),
    // The sender has, by definition, read their own message.
    prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: params.viewer.userId },
      data: { lastReadAt: now },
    }),
  ]);

  // Tell the other side. Staff messages reach both.
  const recipients = new Set<string>();
  if (role !== 'CUSTOMER') recipients.add(booking.customerId);
  if (role !== 'PROVIDER' && booking.providerUserId) recipients.add(booking.providerUserId);

  const senderName = message.sender?.fullName.split(' ')[0] ?? 'Support';
  await Promise.all(
    [...recipients].map((userId) =>
      notify({
        event: NOTIFICATION_EVENTS.NEW_MESSAGE,
        userId,
        title: `${senderName} ka message — ${booking.reference}`,
        body: body.slice(0, 140) || 'Sent a file.',
        href:
          userId === booking.providerUserId
            ? `/provider/jobs/${params.bookingId}`
            : `/account/bookings/${params.bookingId}`,
        data: { bookingId: params.bookingId, messageId: message.id },
      }),
    ),
  );

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    systemAuthor: message.systemAuthor,
    sender: message.sender
      ? {
          id: message.sender.id,
          fullName: message.sender.fullName.split(' ')[0] ?? message.sender.fullName,
          isYou: true,
        }
      : null,
    attachment: message.attachment
      ? {
          id: message.attachment.id,
          url: `/api/files/${message.attachment.id}`,
          mimeType: message.attachment.mimeType,
          originalName: message.attachment.originalName,
        }
      : null,
  };
}

/** Mark the thread read up to now, for the unread badge. */
export async function markThreadRead(bookingId: string, userId: string): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { kind: 'BOOKING', bookingId },
    select: { id: true },
  });
  if (!conversation) return;
  await prisma.conversationParticipant.updateMany({
    where: { conversationId: conversation.id, userId },
    data: { lastReadAt: new Date() },
  });
}

/** How many booking messages this user has not seen, for the nav badge. */
export async function unreadMessageCount(userId: string): Promise<number> {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId, conversation: { kind: 'BOOKING' } },
    select: { conversationId: true, lastReadAt: true },
  });
  if (parts.length === 0) return 0;

  return prisma.message.count({
    where: {
      OR: parts.map((part) => ({
        conversationId: part.conversationId,
        senderUserId: { not: userId },
        ...(part.lastReadAt ? { createdAt: { gt: part.lastReadAt } } : {}),
      })),
    },
  });
}
