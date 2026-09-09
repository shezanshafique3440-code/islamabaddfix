import { createHmac, timingSafeEqual } from 'crypto';
import { env, integrations } from '../../env';
import type { ChargeResult, PaymentProvider, RefundResult } from '../types';

/**
 * Online gateway slot.
 *
 * A concrete Pakistani gateway (JazzCash, Easypaisa, Safepay, a card acquirer)
 * plugs in here. The redirect/webhook shape below is what those APIs have in
 * common, so wiring one up is a matter of filling in the two request bodies.
 *
 * Deliberately NOT faked: with no credentials, `charge` returns FAILED with a
 * clear reason and the checkout UI hides the option instead of showing a button
 * that pretends to take a payment.
 */
export const gatewayProvider: PaymentProvider = {
  key: 'online_gateway',
  method: 'ONLINE_GATEWAY',
  label: 'Card / wallet',
  labelUr: 'Card ya wallet se',
  description: 'Debit/credit card ya mobile wallet se online payment.',
  isConfigured: () => integrations.onlinePayments.configured,
  initialStatus: () => 'PENDING',

  async charge(): Promise<ChargeResult> {
    if (!integrations.onlinePayments.configured) {
      return {
        kind: 'FAILED',
        reason:
          'Online payment gateway is deployment par configured nahi hai. PAYMENT_GATEWAY aur PAYMENT_API_KEY set karein.',
      };
    }
    // Implementation note for whoever wires the real gateway: create the hosted
    // checkout session here and return { kind: 'REDIRECT', redirectUrl, externalRef }.
    return {
      kind: 'FAILED',
      reason:
        'Gateway driver ka charge() implement nahi hua. Apne provider ka checkout call add karein.',
    };
  },

  async refund(): Promise<RefundResult> {
    if (!integrations.onlinePayments.configured) {
      return {
        kind: 'FAILED',
        reason: 'Online payment gateway configured nahi hai.',
      };
    }
    return {
      kind: 'MANUAL_REQUIRED',
      instructions: 'Gateway dashboard se refund karein aur yahan record karein.',
    };
  },

  /**
   * HMAC-SHA256 over the raw body, compared in constant time. Almost every
   * gateway uses this shape; only the header name tends to differ.
   */
  verifyWebhook(rawBody: string, headers: Headers) {
    if (!env.PAYMENT_WEBHOOK_SECRET) {
      return { valid: false, reason: 'PAYMENT_WEBHOOK_SECRET set nahi hai.' };
    }
    const signature = headers.get('x-payment-signature');
    if (!signature) return { valid: false, reason: 'Signature header missing hai.' };

    const expected = createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'Signature match nahi karta.' };
    }
    return { valid: true };
  },
};
