import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { notificationPreferencesSchema } from '@/lib/validation/schemas';
import { getNotificationPreferences, setNotificationPreferences } from '@/lib/notifications';

/**
 * Delivery preferences.
 *
 * In-app is not listed and cannot be switched off: a customer has to be able to
 * find out that their technician is on the way.
 */
export const GET = route(async () => {
  const ctx = await requireAuth();
  return ok(await getNotificationPreferences(ctx.user.id));
});

export const PATCH = route(async (request) => {
  const ctx = await requireAuth();
  const input = await parseJson(request, notificationPreferencesSchema);
  return ok(await setNotificationPreferences(ctx.user.id, input));
});
