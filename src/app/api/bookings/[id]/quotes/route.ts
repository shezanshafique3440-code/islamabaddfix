import { z } from 'zod';
import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { quoteDecisionSchema } from '@/lib/validation/schemas';
import { approveQuote, quoteHistoryFor, rejectQuote } from '@/lib/bookings/quotes';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStaff } from '@/lib/auth/rbac';

type Params = { params: Promise<{ id: string }> };

async function assertParty(bookingId: string, ctx: Awaited<ReturnType<typeof requireAuth>>) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, customerId: true, providerId: true },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  const isCustomer = booking.customerId === ctx.user.id;
  const isProvider = ctx.providerId !== undefined && booking.providerId === ctx.providerId;
  if (!isCustomer && !isProvider && !isStaff(ctx.role)) {
    throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  }
  return booking;
}

/** All quotes on a booking — the price negotiation history. */
export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await assertParty(id, ctx);
  const quotes = await quoteHistoryFor(id);
  return ok(quotes);
});

/** Customer decision on the pending quote. */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const booking = await assertParty(id, ctx);

  if (booking.customerId !== ctx.user.id) {
    throw new AppError('FORBIDDEN', 'Quote sirf customer approve ya reject kar sakta hai.');
  }

  const input = await parseJson(
    request,
    quoteDecisionSchema.extend({ quoteId: z.string().uuid() }),
  );

  if (input.decision === 'approve') {
    const result = await approveQuote({
      quoteId: input.quoteId,
      customerUserId: ctx.user.id,
    });
    return ok({
      decision: 'approved',
      approvedTotalPaisa: result.approvedTotalPaisa,
      quoteId: result.quote.id,
    });
  }

  const quote = await rejectQuote({
    quoteId: input.quoteId,
    customerUserId: ctx.user.id,
    reason: input.reason,
  });
  return ok({ decision: 'rejected', quoteId: quote.id });
});
