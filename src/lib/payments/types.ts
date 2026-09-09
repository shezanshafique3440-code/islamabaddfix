import type { PaymentMethod, PaymentStatus } from '@prisma/client';

/**
 * Payment provider contract.
 *
 * The booking flow only ever talks to this interface, never to a specific
 * gateway. Adding JazzCash, Easypaisa or a card acquirer later means adding a
 * driver — the booking, quote and commission code does not change.
 *
 * Nothing in this layer accepts or returns a card number, CVV or any raw
 * instrument data. Gateways are expected to be redirect- or token-based.
 */

export interface ChargeIntent {
  bookingId: string;
  bookingReference: string;
  amountPaisa: number;
  currency: 'PKR';
  customer: { id: string; email: string; fullName: string; phone: string | null };
  /** Where the gateway should return the customer after a hosted checkout. */
  returnUrl?: string;
  description: string;
}

export type ChargeResult =
  /** Terminal: money is collected (cash handed over, transfer confirmed). */
  | { kind: 'PAID'; externalRef?: string; metadata?: Record<string, unknown> }
  /** Authorized but not captured — capture happens on completion. */
  | { kind: 'AUTHORIZED'; externalRef: string; metadata?: Record<string, unknown> }
  /** The customer must be sent somewhere to finish paying. */
  | { kind: 'REDIRECT'; redirectUrl: string; externalRef: string }
  /** Nothing to collect up front; settle at completion (cash on service). */
  | { kind: 'DEFERRED'; note: string }
  | { kind: 'FAILED'; reason: string };

export interface RefundIntent {
  paymentId: string;
  externalRef?: string | null;
  amountPaisa: number;
  reason: string;
}

export type RefundResult =
  | { kind: 'REFUNDED'; externalRef?: string }
  /** The refund is real but happens outside the system (cash back, bank transfer). */
  | { kind: 'MANUAL_REQUIRED'; instructions: string }
  | { kind: 'FAILED'; reason: string };

export interface PaymentProvider {
  readonly key: string;
  readonly method: PaymentMethod;
  readonly label: string;
  readonly labelUr: string;
  /** Short line shown next to the option at checkout. */
  readonly description: string;
  isConfigured(): boolean;
  /** Status a Payment row starts in when this provider is chosen. */
  initialStatus(): PaymentStatus;
  charge(intent: ChargeIntent): Promise<ChargeResult>;
  refund(intent: RefundIntent): Promise<RefundResult>;
  /**
   * Verify an inbound webhook. Providers that have no webhooks return
   * `supported: false` so the route can reject the request outright.
   */
  verifyWebhook?(rawBody: string, headers: Headers): { valid: boolean; reason?: string };
}
