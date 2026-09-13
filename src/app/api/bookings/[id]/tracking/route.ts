import { ok, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { trackingFor } from '@/lib/bookings/tracking';

/**
 * Where the technician is, for this customer's own booking.
 *
 * Polled by the booking page while a technician is travelling. Authorisation is
 * part of the query itself — the booking must belong to the caller — so there is
 * no path here to watch somebody else's technician.
 */
export const GET = route(async (_request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAuth();
  const { id } = await context.params;
  return ok(await trackingFor({ bookingId: id, customerId: ctx.user.id }));
});
