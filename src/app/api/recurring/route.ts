import { created, ok, parseJson, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { recurringCreateSchema } from '@/lib/validation/schemas';
import { createSchedule, describeSchedule, schedulesFor } from '@/lib/bookings/recurring';

export const GET = route(async () => {
  const ctx = await requireAuth();
  const schedules = await schedulesFor(ctx.user.id);
  return ok(
    schedules.map((schedule) => ({
      id: schedule.id,
      reference: schedule.reference,
      status: schedule.status,
      serviceName: schedule.service.name,
      addressLabel: schedule.address.label,
      providerName: schedule.provider?.businessName ?? null,
      summary: describeSchedule(schedule),
      nextOccurrenceAt: schedule.nextOccurrenceAt,
      bookingsCreated: schedule._count.bookings,
    })),
  );
});

export const POST = route(async (request) => {
  const ctx = await requirePermission('booking:create');
  await enforceRateLimit(RATE_LIMITS.bookingCreate, rateLimitIdentity(request, ctx.user.id));

  const input = await parseJson(request, recurringCreateSchema);
  const schedule = await createSchedule({
    customerId: ctx.user.id,
    serviceId: input.serviceId,
    addressId: input.addressId,
    providerId: input.providerId ?? null,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    timeOfDayMinutes: input.timeOfDayMinutes,
    dayOfWeek: input.dayOfWeek ?? null,
    dayOfMonth: input.dayOfMonth ?? null,
    problemDescription: input.problemDescription,
    customerNotes: input.customerNotes ?? null,
    startsOn: input.startsOn ?? null,
    maxOccurrences: input.maxOccurrences ?? null,
    endsAt: input.endsAt ?? null,
  });

  return created(
    {
      id: schedule.id,
      reference: schedule.reference,
      nextOccurrenceAt: schedule.nextOccurrenceAt,
    },
    {
      // Nothing is booked yet. Say when the first booking will appear.
      firstBookingCreatedBefore: schedule.nextOccurrenceAt,
    },
  );
});
