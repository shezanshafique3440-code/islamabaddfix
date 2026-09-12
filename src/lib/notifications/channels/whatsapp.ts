import { env, integrations } from '../../env';
import type {
  DeliveryOutcome,
  DeliveryTarget,
  NotificationChannelDriver,
  NotificationPayload,
} from '../types';

/**
 * WhatsApp Cloud API delivery.
 *
 * Outside the 24-hour customer-service window Meta only permits approved
 * template messages, so free-form sends will legitimately fail for cold
 * recipients; that is reported as FAILED rather than hidden.
 */
export const whatsappChannel: NotificationChannelDriver = {
  channel: 'WHATSAPP',
  isConfigured: () => integrations.whatsapp.configured,

  async send(target: DeliveryTarget, payload: NotificationPayload): Promise<DeliveryOutcome> {
    if (!integrations.whatsapp.configured) {
      return {
        status: 'SKIPPED_NOT_CONFIGURED',
        reason: 'WHATSAPP_API_KEY / WHATSAPP_PHONE_NUMBER_ID set nahi hai.',
      };
    }
    if (!target.phone) {
      return { status: 'FAILED', reason: 'Recipient ka phone number mojood nahi hai.' };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: target.phone.replace('+', ''),
            type: 'text',
            text: { body: `*${payload.title}*\n\n${payload.body}` },
          }),
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        return { status: 'FAILED', reason: `WhatsApp ${response.status}: ${detail.slice(0, 200)}` };
      }
      const json = (await response.json()) as { messages?: Array<{ id: string }> };
      return { status: 'SENT', providerRef: json.messages?.[0]?.id };
    } catch (error) {
      return {
        status: 'FAILED',
        reason: error instanceof Error ? error.message : 'Unknown transport error',
      };
    }
  },
};
