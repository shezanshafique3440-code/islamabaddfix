import { env, integrations } from '../../env';
import type {
  DeliveryOutcome,
  DeliveryTarget,
  NotificationChannelDriver,
  NotificationPayload,
} from '../types';

/**
 * SMS delivery.
 *
 * Two drivers, because there is no single answer in this market:
 *
 *  - `twilio` works anywhere and is worth the price for a pilot.
 *  - `generic` is for the Pakistani aggregators — Jazz, Telenor and the
 *    resellers in front of them — which each invent their own query string.
 *    Rather than guess one and ship a driver that works for nobody, the
 *    operator supplies the shape: a URL with {key} {to} {text} {from}
 *    placeholders, a method, and optionally a body template and headers.
 *
 * Message bodies are capped. An SMS is billed per 160-character part (70 if it
 * contains anything outside GSM-7), so a long notification quietly becomes four
 * charges; better to send a short one that points at the app.
 */

/** Roughly two parts of GSM-7. Long enough to be useful, short enough to be cheap. */
const MAX_SMS_CHARACTERS = 300;

/** Substitute {key} {to} {text} {from} into a template, each URL-encoded once. */
function fill(template: string, values: Record<string, string>, encode: boolean): string {
  return template.replace(/\{(key|to|text|from)\}/g, (_match, name: string) => {
    const value = values[name] ?? '';
    return encode ? encodeURIComponent(value) : value;
  });
}

/** `Name: value` pairs, one per line or separated by `|`. */
function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(/[\n|]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(':');
        return separator === -1
          ? [line, '']
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

async function sendViaTwilio(to: string, text: string): Promise<DeliveryOutcome> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.SMS_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: env.SMS_SENDER_ID, Body: text });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      // Twilio authenticates with the account SID as the username.
      Authorization: `Basic ${Buffer.from(`${env.SMS_ACCOUNT_SID}:${env.SMS_API_KEY}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const detail = await response.text();
  if (!response.ok) {
    return { status: 'FAILED', reason: `Twilio ${response.status}: ${detail.slice(0, 200)}` };
  }
  const json = JSON.parse(detail) as { sid?: string; error_message?: string | null };
  if (json.error_message) return { status: 'FAILED', reason: json.error_message.slice(0, 200) };
  return { status: 'SENT', providerRef: json.sid };
}

async function sendViaGateway(to: string, text: string): Promise<DeliveryOutcome> {
  const values = {
    key: env.SMS_API_KEY ?? '',
    to,
    text,
    from: env.SMS_SENDER_ID,
  };

  // Placeholders in a URL are encoded; placeholders in a body are not, because
  // the body template decides its own encoding (form, JSON, XML).
  const url = fill(env.SMS_GATEWAY_URL!, values, true);
  const method = env.SMS_GATEWAY_METHOD;
  const headers = parseHeaders(env.SMS_GATEWAY_HEADERS);

  const response = await fetch(url, {
    method,
    headers:
      method === 'POST' && env.SMS_GATEWAY_BODY
        ? { 'Content-Type': env.SMS_GATEWAY_CONTENT_TYPE, ...headers }
        : headers,
    body:
      method === 'POST' && env.SMS_GATEWAY_BODY
        ? fill(
            env.SMS_GATEWAY_BODY,
            env.SMS_GATEWAY_CONTENT_TYPE.includes('json')
              ? // JSON needs its own escaping, not URL escaping.
                Object.fromEntries(
                  Object.entries(values).map(([k, v]) => [k, JSON.stringify(v).slice(1, -1)]),
                )
              : Object.fromEntries(
                  Object.entries(values).map(([k, v]) => [k, encodeURIComponent(v)]),
                ),
            false,
          )
        : undefined,
  });

  const detail = await response.text();
  if (!response.ok) {
    return { status: 'FAILED', reason: `SMS gateway ${response.status}: ${detail.slice(0, 200)}` };
  }
  // Aggregators answer in half a dozen shapes; the body is recorded rather than
  // parsed, so a delivery can still be traced back to the gateway's own reply.
  return { status: 'SENT', providerRef: detail.trim().slice(0, 120) || undefined };
}

export const smsChannel: NotificationChannelDriver = {
  channel: 'SMS',
  isConfigured: () => integrations.sms.configured,

  async send(target: DeliveryTarget, payload: NotificationPayload): Promise<DeliveryOutcome> {
    if (!integrations.sms.configured) {
      return {
        status: 'SKIPPED_NOT_CONFIGURED',
        reason:
          env.SMS_PROVIDER === 'generic'
            ? 'SMS_GATEWAY_URL / SMS_API_KEY is not set.'
            : 'SMS_PROVIDER / SMS_API_KEY is not set.',
      };
    }
    if (!target.phone) {
      return { status: 'FAILED', reason: 'The recipient has no phone number on file.' };
    }

    const text = `${payload.title}: ${payload.body}`.slice(0, MAX_SMS_CHARACTERS);

    try {
      return env.SMS_PROVIDER === 'twilio'
        ? await sendViaTwilio(target.phone, text)
        : await sendViaGateway(target.phone, text);
    } catch (error) {
      return {
        status: 'FAILED',
        reason: error instanceof Error ? error.message : 'Unknown transport error',
      };
    }
  },
};
