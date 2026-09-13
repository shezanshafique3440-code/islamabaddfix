import { integrations } from '../../env';
import { sendPushToUser } from '../push/send';
import type {
  DeliveryOutcome,
  DeliveryTarget,
  NotificationChannelDriver,
  NotificationPayload,
} from '../types';

/**
 * Web Push.
 *
 * Reaches a browser that is closed, on desktop and on Android, with no account
 * anywhere and no SDK — the keypair in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY is
 * self-issued. On iOS it works once the site is added to the home screen, which
 * is Apple's rule rather than ours.
 *
 * "Configured but nobody subscribed" is reported as a skip rather than a
 * failure: there is nothing wrong, the user simply has no device turned on.
 */
export const pushChannel: NotificationChannelDriver = {
  channel: 'PUSH',
  isConfigured: () => integrations.push.configured,

  async send(target: DeliveryTarget, payload: NotificationPayload): Promise<DeliveryOutcome> {
    if (!integrations.push.configured) {
      return {
        status: 'SKIPPED_NOT_CONFIGURED',
        reason: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY is not set.',
      };
    }

    const report = await sendPushToUser(target.userId, {
      title: payload.title,
      body: payload.body,
      href: payload.href,
      // One tag per event type, so a second quote update replaces the first in
      // the tray instead of stacking.
      tag: payload.event,
    });

    if (report.total === 0) {
      return {
        status: 'SKIPPED_NOT_CONFIGURED',
        reason: 'This user has no browser subscribed to push notifications.',
      };
    }
    if (report.sent > 0) {
      return { status: 'SENT', providerRef: `${report.sent}/${report.total} device(s)` };
    }
    return {
      status: 'FAILED',
      reason: report.lastError ?? 'Every push subscription failed.',
    };
  },
};
