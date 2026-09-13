import { ok, route } from '@/lib/http';
import { integrations } from '@/lib/env';
import { vapidKeys } from '@/lib/notifications/push/vapid';

/**
 * The VAPID public key, which the browser needs before it can subscribe.
 *
 * Public by design — it is handed to every push service on every message — so
 * this is open to anyone. It is fetched rather than inlined as a NEXT_PUBLIC_*
 * variable so that turning push on does not require rebuilding the app.
 */
export const GET = route(async () => {
  const keys = vapidKeys();
  return ok({
    configured: integrations.push.configured,
    publicKey: keys?.publicKey ?? null,
  });
});
