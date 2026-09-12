import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { rescheduleSchema } from '@/lib/validation/schemas';
import { rescheduleBooking, reschedulesRemaining } from '@/lib/bookings/reschedule';

type Params = { params: Promise<{ id: string }> };

/** How many moves are left on this booking. */
export const GET = route(async (_request, { params }: Params) => {
  await requireAuth();
  const { id } = await params;
  return ok({ remaining: await reschedulesRemaining(id) });
});

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = await parseJson(request, rescheduleSchema);

  const booking = await rescheduleBooking({
    bookingId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    actorProviderId: ctx.providerId,
    scheduledFor: input.scheduledFor,
    reason: input.reason,
  });

  return ok({
    id: booking.id,
    scheduledFor: booking.scheduledFor,
    remaining: await reschedulesRemaining(id),
  });
});
