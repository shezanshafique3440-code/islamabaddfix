import { ok, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { openCallChannel } from '@/lib/calling';

/**
 * Open a call channel to the other party on a booking.
 *
 * POST rather than GET because it is audited and, once a telephony provider is
 * configured, will allocate a bridge — both are side effects.
 */
export const POST = route(async (_request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAuth();
  const { id } = await context.params;
  return ok(await openCallChannel({ bookingId: id, callerUserId: ctx.user.id }));
});
