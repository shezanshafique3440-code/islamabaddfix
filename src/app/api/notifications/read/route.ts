import { z } from 'zod';
import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { markRead } from '@/lib/notifications';

const bodySchema = z.object({ notificationId: z.string().uuid().optional() });

/** Mark one notification read, or all of them when no id is given. */
export const POST = route(async (request) => {
  const ctx = await requireAuth();
  const { notificationId } = await parseJson(request, bodySchema);
  const count = await markRead(ctx.user.id, notificationId);
  return ok({ markedRead: count });
});
