import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { cancelBookingSchema } from '@/lib/validation/schemas';
import { cancelBooking } from '@/lib/bookings/service';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStaff } from '@/lib/auth/rbac';
import { formatPaisa } from '@/lib/money';

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = await parseJson(request, cancelBookingSchema);

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, customerId: true, providerId: true },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');

  const isCustomer = booking.customerId === ctx.user.id;
  const isAssignedProvider = ctx.providerId !== undefined && booking.providerId === ctx.providerId;
  if (!isCustomer && !isAssignedProvider && !isStaff(ctx.role)) {
    throw new AppError('FORBIDDEN', 'You cannot cancel this booking.');
  }

  const result = await cancelBooking({
    bookingId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    reason: input.reason,
  });

  return ok({
    status: result.booking.status,
    cancellationFeePaisa: result.feePaisa,
    message:
      result.feePaisa > 0
        ? `Booking cancelled. Late cancellation fee: ${formatPaisa(result.feePaisa)}.`
        : 'Booking cancelled.',
  });
});
