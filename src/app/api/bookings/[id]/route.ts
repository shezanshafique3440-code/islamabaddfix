import { ok, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { getBookingDetailFor } from '@/lib/bookings/queries';

type Params = { params: Promise<{ id: string }> };

/**
 * Booking detail, projected for whoever is asking: the customer, the assigned
 * provider, or staff. Non-parties get a 404.
 */
export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const detail = await getBookingDetailFor(id, ctx);
  return ok(detail);
});
