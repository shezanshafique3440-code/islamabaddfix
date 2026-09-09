import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { bookingListQuerySchema } from '@/lib/validation/schemas';
import { listBookingsFor, summarizeBooking } from '@/lib/bookings/queries';

export const GET = route(async (request) => {
  const ctx = await requirePermission('booking:read:any');
  const query = parseQuery(request, bookingListQuerySchema);
  const result = await listBookingsFor(ctx, query);
  return ok(result.items.map(summarizeBooking), { pagination: result.pagination });
});
