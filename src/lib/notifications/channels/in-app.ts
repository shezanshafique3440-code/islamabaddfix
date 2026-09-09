import type { NotificationChannelDriver } from '../types';

/**
 * In-app notifications. Always available — the row written by the dispatcher
 * *is* the delivery, so `send` only confirms it.
 */
export const inAppChannel: NotificationChannelDriver = {
  channel: 'IN_APP',
  isConfigured: () => true,
  async send() {
    return { status: 'SENT' };
  },
};
