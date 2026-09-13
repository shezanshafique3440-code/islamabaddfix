import { env, integrations } from '../../env';
import type {
  DeliveryOutcome,
  DeliveryTarget,
  NotificationChannelDriver,
  NotificationPayload,
} from '../types';
import { renderEmail } from '../templates';

/**
 * Email delivery.
 *
 * Two backends behind one driver: Resend's HTTP API for a hosted setup, and
 * SMTP for everything else — a company mailbox, a VPS relay, or one of the
 * local providers that offers nothing but SMTP.
 *
 * The SMTP module is imported lazily. It opens a connection pool, and a
 * deployment on Resend should not pay for that just by importing this file.
 */
export const emailChannel: NotificationChannelDriver = {
  channel: 'EMAIL',
  isConfigured: () => integrations.email.configured,

  async send(target: DeliveryTarget, payload: NotificationPayload): Promise<DeliveryOutcome> {
    if (!integrations.email.configured) {
      return {
        status: 'SKIPPED_NOT_CONFIGURED',
        reason: 'EMAIL_PROVIDER / EMAIL_API_KEY is not set.',
      };
    }

    const { subject, html, text } = renderEmail(target, payload);

    if (env.EMAIL_PROVIDER === 'resend') {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.EMAIL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [target.email],
            subject,
            html,
            text,
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          return { status: 'FAILED', reason: `Resend ${response.status}: ${detail.slice(0, 200)}` };
        }
        const json = (await response.json()) as { id?: string };
        return { status: 'SENT', providerRef: json.id };
      } catch (error) {
        return {
          status: 'FAILED',
          reason: error instanceof Error ? error.message : 'Unknown transport error',
        };
      }
    }

    try {
      const { sendViaSmtp } = await import('../transports/smtp');
      const messageId = await sendViaSmtp({ to: target.email, subject, html, text });
      return { status: 'SENT', providerRef: messageId };
    } catch (error) {
      return {
        status: 'FAILED',
        reason: error instanceof Error ? error.message.slice(0, 200) : 'Unknown SMTP error',
      };
    }
  },
};
