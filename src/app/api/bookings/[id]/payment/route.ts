import { z } from 'zod';
import { created, ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { initiatePaymentSchema, settlePaymentSchema } from '@/lib/validation/schemas';
import { availablePaymentMethods, initiatePayment, settlePayment } from '@/lib/payments';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStaff } from '@/lib/auth/rbac';
import { notify, NOTIFICATION_EVENTS } from '@/lib/notifications';
import { formatPaisa } from '@/lib/money';

type Params = { params: Promise<{ id: string }> };

async function loadParty(bookingId: string, ctx: Awaited<ReturnType<typeof requireAuth>>) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      customerId: true,
      providerId: true,
      status: true,
      provider: { select: { userId: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  const isCustomer = booking.customerId === ctx.user.id;
  const isProvider = ctx.providerId !== undefined && booking.providerId === ctx.providerId;
  if (!isCustomer && !isProvider && !isStaff(ctx.role)) {
    throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  }
  return { booking, isCustomer, isProvider };
}

/** Available payment methods for this booking. */
export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await loadParty(id, ctx);
  const methods = await availablePaymentMethods();
  const payments = await prisma.payment.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: 'desc' },
  });
  return ok({ methods, payments });
});

/** Choose a payment method. Amount comes from the booking, never the client. */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const { booking, isCustomer } = await loadParty(id, ctx);
  if (!isCustomer && !isStaff(ctx.role)) {
    throw new AppError('FORBIDDEN', 'Payment method sirf customer chun sakta hai.');
  }

  const input = await parseJson(request, initiatePaymentSchema);
  const result = await initiatePayment({
    bookingId: booking.id,
    method: input.method,
    actorUserId: ctx.user.id,
    returnUrl: input.returnUrl,
  });

  return created({
    payment: {
      id: result.payment.id,
      method: result.payment.method,
      status: result.payment.status,
      amountPaisa: result.payment.amountPaisa,
    },
    redirectUrl: result.redirectUrl ?? null,
    note: result.note ?? null,
  });
});

/**
 * Record that money actually changed hands.
 *
 * Cash is confirmed by the customer or the assigned technician; a bank transfer
 * is confirmed by staff, since only ops can see the account.
 */
export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const { booking, isCustomer, isProvider } = await loadParty(id, ctx);

  const input = await parseJson(
    request,
    settlePaymentSchema.extend({ paymentId: z.string().uuid() }),
  );

  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, bookingId: booking.id },
  });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment record nahi mila.');

  const canSettle =
    isStaff(ctx.role) || (payment.method === 'CASH' && (isCustomer || isProvider));
  if (!canSettle) {
    throw new AppError(
      'FORBIDDEN',
      'Yeh payment sirf ops team confirm kar sakti hai.',
    );
  }

  const settled = await settlePayment({
    paymentId: payment.id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    note: input.note,
  });

  // Tell the other party, so nobody has to ask whether payment landed.
  const recipients = new Set<string>([booking.customerId]);
  if (booking.provider?.userId) recipients.add(booking.provider.userId);
  recipients.delete(ctx.user.id);
  for (const userId of recipients) {
    await notify({
      event: NOTIFICATION_EVENTS.PAYMENT_RECORDED,
      userId,
      title: 'Payment record ho gayi',
      body: `${booking.reference}: ${formatPaisa(settled.amountPaisa)} paid mark kar diya gaya.`,
      href: `/account/bookings/${booking.id}`,
      data: { bookingId: booking.id, paymentId: settled.id },
    });
  }

  return ok({ payment: { id: settled.id, status: settled.status, paidAt: settled.paidAt } });
});
