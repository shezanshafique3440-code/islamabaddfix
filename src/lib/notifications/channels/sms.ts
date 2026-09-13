import { env, integrations } from '../../env';
import type {
  DeliveryOutcome,
  DeliveryTarget,
  NotificationChannelDriver,
  NotificationPayload,
} from '../types';

/**
 * SMS delivery against a generic HTTP gateway — most Pakistani providers
 * (Telenor, Jazz aggregators) expose a shape close to this. The concrete
 * endpoint is deliberately not guessed: without SMS_API_KEY this reports as
 * unconfigured.
 */
export const smsChannel: NotificationChannelDriver = {
  channel: 'SMS',
  isConfigured: () => integrations.sms.configured,

  async send(target: DeliveryTarget, payload: NotificationPayload): Promise<DeliveryOutcome> {
    if (!integrations.sms.configured) {
      return {
        status: 'SKIPPED_NOT_CONFIGURED',
        reason: 'SMS_PROVIDER / SMS_API_KEY is not set.',
      };
    }
    if (!target.phone) {
      return { status: 'FAILED', reason: 'The recipient has no phone number on file.' };
    }
    // Body is capped so a long notification does not become four billable parts.
    const text = `${payload.title}: ${payload.body}`.slice(0, 300);
    void env.SMS_SENDER_ID;
    void text;
    return {
      status: 'SKIPPED_NOT_CONFIGURED',
      reason:
        'The SMS gateway endpoint is not configured. Implement sendViaGateway() for your aggregator.',
    };
  },
};
