import { created, ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { bookingMessageSchema } from '@/lib/validation/schemas';
import {
  listBookingMessages,
  markThreadRead,
  sendBookingMessage,
} from '@/lib/bookings/messages';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

type Params = { params: Promise<{ id: string }> };

/**
 * The message thread for a booking. Readable by the customer, the assigned
 * provider and staff; anybody else gets the same 404 the booking itself gives.
 */
export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;

  const thread = await listBookingMessages(id, {
    userId: ctx.user.id,
    role: ctx.role,
    providerId: ctx.providerId,
  });
  await markThreadRead(id, ctx.user.id);

  return ok(thread.messages, { conversationId: thread.conversationId });
});

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await enforceRateLimit(RATE_LIMITS.message, rateLimitIdentity(request, ctx.user.id));
  const input = await parseJson(request, bookingMessageSchema);

  const message = await sendBookingMessage({
    bookingId: id,
    viewer: { userId: ctx.user.id, role: ctx.role, providerId: ctx.providerId },
    body: input.body,
    attachmentId: input.attachmentId ?? null,
  });

  return created(message);
});
