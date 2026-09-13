import { z } from 'zod';
import { created, ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { integrations } from '@/lib/env';

/**
 * A browser registering, or dropping, its push subscription.
 *
 * The endpoint is the identity: one browser profile on one device yields one
 * endpoint, and re-subscribing returns the same one. So a repeat POST updates
 * the row rather than creating a second — which is what makes it safe for the
 * client to call this on every page load to heal a subscription the browser
 * quietly rotated.
 *
 * A subscription is always owned by the user who registered it. If the same
 * browser is later used by a different account, the endpoint moves to them;
 * leaving it with the previous owner would send that person's booking updates
 * to someone else's screen.
 */
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    // Uncompressed P-256 point, base64url: 65 bytes → 87-88 characters.
    p256dh: z.string().min(80).max(200),
    // 16 bytes, base64url.
    auth: z.string().min(16).max(64),
  }),
});

/** Push services all live on https. Anything else is not a push endpoint. */
function assertPushEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') {
    throw new AppError('VALIDATION_ERROR', 'A push endpoint must be an https URL.');
  }
}

export const POST = route(async (request) => {
  const ctx = await requireAuth();

  if (!integrations.push.configured) {
    throw new AppError(
      'INTEGRATION_NOT_CONFIGURED',
      'Push notifications are not set up on this deployment.',
    );
  }

  const input = await parseJson(request, subscriptionSchema);
  assertPushEndpoint(input.endpoint);

  const userAgent = request.headers.get('user-agent')?.slice(0, 200) ?? null;

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: ctx.user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    },
    update: {
      userId: ctx.user.id,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
      failureCount: 0,
    },
  });

  return created({ id: subscription.id });
});

const removeSchema = z.object({ endpoint: z.string().url().max(2000) });

export const DELETE = route(async (request) => {
  const ctx = await requireAuth();
  const input = await parseJson(request, removeSchema);

  // Scoped to the caller: knowing an endpoint must not let you unsubscribe
  // somebody else's device.
  const result = await prisma.pushSubscription.deleteMany({
    where: { endpoint: input.endpoint, userId: ctx.user.id },
  });

  return ok({ removed: result.count });
});
