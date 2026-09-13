import type { NotificationChannelDriver } from '../types';

/**
 * Web/mobile push. No provider is wired up and there is no device-token table
 * yet, so this always reports unconfigured. Adding it means a PushSubscription
 * model plus a driver body — no call site changes.
 */
export const pushChannel: NotificationChannelDriver = {
  channel: 'PUSH',
  isConfigured: () => false,
  async send() {
    return {
      status: 'SKIPPED_NOT_CONFIGURED',
      reason: 'Push notifications are not configured on this deployment.',
    };
  },
};
