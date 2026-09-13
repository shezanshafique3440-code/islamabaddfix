import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { recurringStatusSchema } from '@/lib/validation/schemas';
import { setScheduleStatus } from '@/lib/bookings/recurring';

export const PATCH = route(async (request, context: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAuth();
  const { id } = await context.params;
  const input = await parseJson(request, recurringStatusSchema);

  const schedule = await setScheduleStatus({
    scheduleId: id,
    actorUserId: ctx.user.id,
    status: input.status,
    reason: input.reason ?? undefined,
  });
  return ok({ id: schedule.id, status: schedule.status });
});
