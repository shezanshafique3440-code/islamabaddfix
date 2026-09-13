import { prisma } from '../../db';
import { encryptPushPayload, MAX_PAYLOAD_BYTES } from './crypto';
import { vapidAuthorization, vapidKeys } from './vapid';

/**
 * Delivering one notification to every browser a user has subscribed.
 *
 * Two things this handles that a naive implementation does not:
 *
 * A subscription that the push service reports as gone (404 or 410) is deleted
 * immediately. Those are permanent — the browser profile was wiped, the site
 * data cleared, the permission revoked — and a row that stays behind fails on
 * every notification forever.
 *
 * Everything else is counted. A push service having a bad minute is not a
 * reason to lose someone's notifications, so transient failures only retire a
 * subscription after enough of them in a row that it cannot be transient.
 */

/** After this many consecutive transport failures, stop trying. */
const MAX_CONSECUTIVE_FAILURES = 8;

/** How long a push service should hold the message for a device that is offline. */
const TTL_SECONDS = 24 * 60 * 60;

export interface PushMessage {
  title: string;
  body: string;
  href?: string;
  tag?: string;
}

export interface PushSendReport {
  sent: number;
  failed: number;
  removed: number;
  /** Total subscriptions considered. Zero means the user has no device on. */
  total: number;
  lastError?: string;
}

/**
 * Trim a message to what one record holds.
 *
 * A notification that is too long is worth shortening; it is not worth
 * dropping, which is what an unhandled length error would do.
 */
function encodeMessage(message: PushMessage): string {
  let json = JSON.stringify(message);
  if (Buffer.byteLength(json, 'utf8') <= MAX_PAYLOAD_BYTES) return json;

  // Shrink the body until the *encoded* message fits. One subtraction is not
  // enough: JSON escaping and multi-byte characters mean the trimmed string can
  // still encode longer than the arithmetic predicted, and being one byte over
  // loses the notification entirely.
  let body = message.body;
  while (body.length > 0 && Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    const over = Buffer.byteLength(json, 'utf8') - MAX_PAYLOAD_BYTES;
    // Always take at least one character off, so this cannot spin.
    body = body.slice(0, Math.max(0, body.length - Math.max(1, over)));
    json = JSON.stringify({ ...message, body: `${body}…` });
  }
  return json;
}

export async function sendPushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushSendReport> {
  const keys = vapidKeys();
  if (!keys)
    return { sent: 0, failed: 0, removed: 0, total: 0, lastError: 'VAPID keys are unset.' };

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const report: PushSendReport = { sent: 0, failed: 0, removed: 0, total: subscriptions.length };
  if (subscriptions.length === 0) return report;

  const payload = encodeMessage(message);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const body = encryptPushPayload(payload, {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        });

        const response = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await vapidAuthorization(subscription.endpoint, keys),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(TTL_SECONDS),
            // "normal" lets a phone batch this with its next wake-up rather
            // than lighting up the radio for it.
            Urgency: 'normal',
          },
          body: new Uint8Array(body),
        });

        if (response.ok) {
          report.sent += 1;
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { lastUsedAt: new Date(), failureCount: 0 },
          });
          return;
        }

        // Gone for good: the browser told the push service to forget it.
        if (response.status === 404 || response.status === 410) {
          report.removed += 1;
          await prisma.pushSubscription.delete({ where: { id: subscription.id } });
          return;
        }

        report.failed += 1;
        report.lastError = `${response.status} from ${new URL(subscription.endpoint).host}`;

        const failureCount = subscription.failureCount + 1;
        if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
          report.removed += 1;
          await prisma.pushSubscription.delete({ where: { id: subscription.id } });
        } else {
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { failureCount },
          });
        }
      } catch (error) {
        report.failed += 1;
        report.lastError = error instanceof Error ? error.message : 'Unknown push transport error';
      }
    }),
  );

  return report;
}
