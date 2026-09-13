import { createHmac, timingSafeEqual } from 'crypto';
import { env, integrations } from '../../env';
import type { ChargeIntent, ChargeResult, PaymentProvider, RefundResult } from '../types';

/**
 * Online gateway.
 *
 * Implements the hosted-checkout redirect that the Pakistani gateways share:
 * post a signed request describing the payment, get back a URL, send the
 * customer there, and settle on the webhook. JazzCash, Easypaisa and Safepay
 * all work this way; the field names differ, which is why the response is read
 * loosely and the request body is documented rather than clever.
 *
 * Two things this driver will not do. It never reports a payment as taken on
 * the strength of its own request — only the signed webhook moves a Payment to
 * PAID. And with no credentials it returns FAILED with a reason, so the
 * checkout UI hides the option instead of showing a button that pretends.
 *
 * The amount is passed through from the caller, which computed it server-side
 * from the booking. Nothing here recomputes or accepts an amount.
 */
export const gatewayProvider: PaymentProvider = {
  key: 'online_gateway',
  method: 'ONLINE_GATEWAY',
  label: 'Card / wallet',
  description: 'Online payment by debit/credit card or mobile wallet.',
  isConfigured: () => integrations.onlinePayments.configured,
  initialStatus: () => 'PENDING',

  async charge(intent: ChargeIntent): Promise<ChargeResult> {
    if (!integrations.onlinePayments.configured) {
      return {
        kind: 'FAILED',
        reason:
          'The online payment gateway is not configured on this deployment. Set PAYMENT_GATEWAY, PAYMENT_API_KEY, PAYMENT_CHECKOUT_URL and PAYMENT_MERCHANT_ID.',
      };
    }

    // The booking reference is the idempotency key: a customer who taps pay
    // twice gets one checkout, not two.
    const reference = intent.bookingReference;
    const payload = {
      merchantId: env.PAYMENT_MERCHANT_ID,
      reference,
      // Gateways quote in the minor unit, which is what the whole codebase
      // uses anyway — no float ever touches this number.
      amount: intent.amountPaisa,
      currency: intent.currency,
      description: intent.description.slice(0, 200),
      customer: {
        name: intent.customer.fullName,
        email: intent.customer.email,
        phone: intent.customer.phone,
      },
      returnUrl: intent.returnUrl ?? `${env.NEXT_PUBLIC_APP_URL}/account`,
    };

    const body = JSON.stringify(payload);
    // Signed with the integrity salt so the gateway can reject a tampered
    // amount before it ever shows the customer a price.
    const signature = createHmac('sha256', env.PAYMENT_SIGNING_SECRET ?? env.PAYMENT_API_KEY!)
      .update(body)
      .digest('hex');

    try {
      const response = await fetch(env.PAYMENT_CHECKOUT_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYMENT_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Payment-Signature': signature,
        },
        body,
      });

      const detail = await response.text();
      if (!response.ok) {
        return {
          kind: 'FAILED',
          reason: `The gateway refused the checkout (${response.status}): ${detail.slice(0, 200)}`,
        };
      }

      const json = JSON.parse(detail) as Record<string, unknown>;
      // Gateways disagree about what to call this; take the first that looks
      // like a URL rather than insisting on one spelling.
      const redirectUrl = [json.redirectUrl, json.checkoutUrl, json.paymentUrl, json.url].find(
        (value): value is string => typeof value === 'string' && value.startsWith('https://'),
      );
      const externalRef = [json.id, json.reference, json.transactionId, json.token].find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );

      if (!redirectUrl) {
        return {
          kind: 'FAILED',
          reason: 'The gateway accepted the request but returned no https checkout URL.',
        };
      }

      return { kind: 'REDIRECT', redirectUrl, externalRef: externalRef ?? reference };
    } catch (error) {
      return {
        kind: 'FAILED',
        reason: error instanceof Error ? error.message.slice(0, 200) : 'Unknown gateway error',
      };
    }
  },

  async refund(): Promise<RefundResult> {
    if (!integrations.onlinePayments.configured) {
      return {
        kind: 'FAILED',
        reason: 'The online payment gateway is not configured.',
      };
    }
    return {
      kind: 'MANUAL_REQUIRED',
      instructions: 'Refund from the gateway dashboard and record it here.',
    };
  },

  /**
   * HMAC-SHA256 over the raw body, compared in constant time. Almost every
   * gateway uses this shape; only the header name tends to differ.
   */
  verifyWebhook(rawBody: string, headers: Headers) {
    if (!env.PAYMENT_WEBHOOK_SECRET) {
      return { valid: false, reason: 'PAYMENT_WEBHOOK_SECRET is not set.' };
    }
    const signature = headers.get('x-payment-signature');
    if (!signature) return { valid: false, reason: 'The signature header is missing.' };

    const expected = createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'The signature does not match.' };
    }
    return { valid: true };
  },
};
