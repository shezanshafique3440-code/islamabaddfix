import { created, ok, parseJson, parseQuery, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { bookingListQuerySchema, createBookingSchema } from '@/lib/validation/schemas';
import { createBooking } from '@/lib/bookings/service';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { listBookingsFor, summarizeBooking } from '@/lib/bookings/queries';

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.bookingCreate, rateLimitIdentity(request, ctx.user.id));

  const input = await parseJson(request, createBookingSchema);
  const result = await createBooking({
    customerId: ctx.user.id,
    serviceId: input.serviceId,
    addressId: input.addressId,
    problemDescription: input.problemDescription,
    providerId: input.providerId ?? null,
    scheduledFor: input.scheduledFor ?? null,
    urgency: input.urgency,
    isEmergency: input.isEmergency,
    customerNotes: input.customerNotes,
    fileIds: input.fileIds,
    intakeSummary: input.intakeSummary ?? null,
    promoCode: input.promoCode,
  });

  return created(
    {
      id: result.booking.id,
      reference: result.booking.reference,
      status: result.booking.status,
      providerId: result.booking.providerId,
    },
    {
      providersNotified: result.offeredProviderIds.length,
      // Honest signal: no match means ops will assign manually.
      awaitingManualAssignment: result.offeredProviderIds.length === 0,
    },
  );
});

export const GET = route(async (request) => {
  const ctx = await requireAuth();
  const query = parseQuery(request, bookingListQuerySchema);
  const result = await listBookingsFor(ctx, query);
  return ok(result.items.map(summarizeBooking), { pagination: result.pagination });
});
