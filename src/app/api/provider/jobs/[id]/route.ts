import { ok, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { getBookingDetailFor } from '@/lib/bookings/queries';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireProvider();
  const { id } = await params;
  const detail = await getBookingDetailFor(id, ctx);
  return ok(detail);
});
