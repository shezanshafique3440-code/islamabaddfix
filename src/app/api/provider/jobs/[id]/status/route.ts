import { ok, parseJson, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { bookingStatusActionSchema } from '@/lib/validation/schemas';
import { acceptBooking, declineBooking } from '@/lib/bookings/service';
import { completeBooking } from '@/lib/bookings/quotes';
import { transitionBooking } from '@/lib/bookings/transition';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { notify, NOTIFICATION_EVENTS } from '@/lib/notifications';
import { formatDateTime } from '@/lib/utils';

type Params = { params: Promise<{ id: string }> };

/**
 * Every provider-side job action funnels through here, so the state machine and
 * its guards are unavoidable. Accept/decline is checked against an actual offer;
 * the rest requires the job to be assigned to this provider.
 */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireProvider();
  const { id } = await params;
  const input = await parseJson(request, bookingStatusActionSchema);

  if (input.action === 'accept') {
    const booking = await acceptBooking({
      bookingId: id,
      providerId: ctx.providerId,
      actorUserId: ctx.user.id,
    });
    return ok({ status: booking.status });
  }

  if (input.action === 'decline') {
    await declineBooking({
      bookingId: id,
      providerId: ctx.providerId,
      reason: input.reason,
    });
    return ok({ declined: true });
  }

  // Remaining actions require the job to belong to this provider.
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      providerId: true,
      customerId: true,
      scheduledFor: true,
      status: true,
      service: { select: { name: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  if (booking.providerId !== ctx.providerId) {
    throw new AppError('FORBIDDEN', 'Yeh job aap ko assign nahi hui.');
  }

  if (input.action === 'complete') {
    await completeBooking({
      bookingId: id,
      providerId: ctx.providerId,
      actorUserId: ctx.user.id,
      completionNotes: input.notes,
    });
    const fresh = await prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { status: true, finalTotalPaisa: true, providerEarningsPaisa: true },
    });
    return ok(fresh);
  }

  const target = (
    {
      confirm_schedule: 'SCHEDULED',
      on_the_way: 'ON_THE_WAY',
      arrived: 'ARRIVED',
      start: 'IN_PROGRESS',
      resume: 'IN_PROGRESS',
    } as const
  )[input.action];

  const result = await transitionBooking({
    bookingId: id,
    to: target,
    actorRole: 'PROVIDER',
    actorUserId: ctx.user.id,
    reason: input.reason,
    ...(input.action === 'confirm_schedule' && input.scheduledFor
      ? { patch: { scheduledFor: input.scheduledFor } }
      : {}),
  });

  await notifyCustomer(booking, target, result.booking.scheduledFor);
  return ok({ status: result.booking.status });
});

/** Keep the customer informed at each step — this is the "where is he?" answer. */
async function notifyCustomer(
  booking: { id: string; reference: string; customerId: string; service: { name: string } },
  target: 'SCHEDULED' | 'ON_THE_WAY' | 'ARRIVED' | 'IN_PROGRESS',
  scheduledFor: Date | null,
): Promise<void> {
  const messages: Record<typeof target, { event: string; title: string; body: string }> = {
    SCHEDULED: {
      event: NOTIFICATION_EVENTS.BOOKING_SCHEDULED,
      title: 'Booking ka time confirm ho gaya',
      body: scheduledFor
        ? `${booking.service.name} — ${formatDateTime(scheduledFor)}.`
        : `${booking.service.name} ka time confirm ho gaya.`,
    },
    ON_THE_WAY: {
      event: NOTIFICATION_EVENTS.PROVIDER_ON_THE_WAY,
      title: 'Technician raste mein hai',
      body: `${booking.reference}: technician aapke ghar ki taraf nikal chuka hai.`,
    },
    ARRIVED: {
      event: NOTIFICATION_EVENTS.PROVIDER_ARRIVED,
      title: 'Technician pohonch gaya',
      body: `${booking.reference}: technician aapke address par pohonch gaya hai.`,
    },
    IN_PROGRESS: {
      event: NOTIFICATION_EVENTS.JOB_STARTED,
      title: 'Kaam shuru ho gaya',
      body: `${booking.reference}: ${booking.service.name} par kaam shuru hai.`,
    },
  };

  const message = messages[target];
  await notify({
    event: message.event as never,
    userId: booking.customerId,
    title: message.title,
    body: message.body,
    href: `/account/bookings/${booking.id}`,
    data: { bookingId: booking.id },
  });
}
