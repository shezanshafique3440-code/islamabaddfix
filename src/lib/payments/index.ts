import type { Payment, PaymentMethod, Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { getSetting } from '../settings';
import { cashProvider } from './providers/cash';
import { bankTransferProvider } from './providers/bank-transfer';
import { gatewayProvider } from './providers/gateway';
import type { ChargeIntent, PaymentProvider } from './types';

export type { ChargeIntent, ChargeResult, PaymentProvider, RefundResult } from './types';

const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  CASH: cashProvider,
  BANK_TRANSFER: bankTransferProvider,
  ONLINE_GATEWAY: gatewayProvider,
};

export function paymentProvider(method: PaymentMethod): PaymentProvider {
  return PROVIDERS[method];
}

/**
 * Payment methods a customer may actually choose right now: enabled in admin
 * settings AND backed by a configured driver. An enabled-but-unconfigured
 * gateway is filtered out rather than shown as a dead option.
 */
export async function availablePaymentMethods(): Promise<
  Array<{
    method: PaymentMethod;
    label: string;
    labelUr: string;
    description: string;
  }>
> {
  const enabled = await getSetting('payments.enabledMethods');
  return enabled
    .map((method) => PROVIDERS[method])
    .filter((provider) => provider.isConfigured())
    .map((provider) => ({
      method: provider.method,
      label: provider.label,
      labelUr: provider.labelUr,
      description: provider.description,
    }));
}

/**
 * Create the Payment row for a booking.
 *
 * The amount is always read from the booking's server-side totals — a client
 * cannot state what it owes.
 */
export async function initiatePayment(params: {
  bookingId: string;
  method: PaymentMethod;
  actorUserId: string;
  returnUrl?: string;
}): Promise<{ payment: Payment; redirectUrl?: string; note?: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: {
      customer: { select: { id: true, email: true, fullName: true, phone: true } },
      service: { select: { name: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');

  const enabled = await getSetting('payments.enabledMethods');
  if (!enabled.includes(params.method)) {
    throw new AppError('VALIDATION_ERROR', 'Yeh payment method is waqt enabled nahi hai.');
  }

  const provider = paymentProvider(params.method);
  if (!provider.isConfigured()) {
    throw new AppError(
      'INTEGRATION_NOT_CONFIGURED',
      `${provider.label} is deployment par configured nahi hai.`,
    );
  }

  const amountPaisa = booking.finalTotalPaisa ?? booking.approvedTotalPaisa;
  if (amountPaisa === null) {
    throw new AppError('QUOTE_REQUIRED', 'Payment se pehle quote approve hona zaroori hai.');
  }

  const existing = await prisma.payment.findFirst({
    where: { bookingId: booking.id, status: { in: ['PAID', 'AUTHORIZED'] } },
  });
  if (existing) {
    throw new AppError('PAYMENT_ALREADY_SETTLED', 'Is booking ki payment pehle se record hai.');
  }

  const intent: ChargeIntent = {
    bookingId: booking.id,
    bookingReference: booking.reference,
    amountPaisa,
    currency: 'PKR',
    customer: booking.customer,
    returnUrl: params.returnUrl,
    description: `${booking.service.name} — ${booking.reference}`,
  };

  const result = await provider.charge(intent);
  if (result.kind === 'FAILED') {
    throw new AppError('INTEGRATION_FAILED', result.reason);
  }

  const status =
    result.kind === 'PAID' ? 'PAID' : result.kind === 'AUTHORIZED' ? 'AUTHORIZED' : 'PENDING';

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      method: params.method,
      status,
      amountPaisa,
      providerKey: provider.key,
      externalRef: 'externalRef' in result ? result.externalRef : null,
      metadata: ('metadata' in result ? result.metadata : {}) as object,
      paidAt: status === 'PAID' ? new Date() : null,
      recordedByUserId: params.actorUserId,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYMENT_RECORDED,
    entity: 'Payment',
    entityId: payment.id,
    actorUserId: params.actorUserId,
    metadata: { bookingId: booking.id, method: params.method, status, amountPaisa },
  });

  return {
    payment,
    redirectUrl: result.kind === 'REDIRECT' ? result.redirectUrl : undefined,
    note: result.kind === 'DEFERRED' ? result.note : undefined,
  };
}

/**
 * Mark a pending payment settled. Used for cash handed to the technician and
 * for bank transfers confirmed by ops — both are real-world events the system
 * records rather than performs.
 */
export async function settlePayment(params: {
  paymentId: string;
  actorUserId: string;
  actorRole: Role;
  note?: string;
}): Promise<Payment> {
  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment record nahi mila.');
  if (payment.status === 'PAID') {
    throw new AppError('PAYMENT_ALREADY_SETTLED', 'Yeh payment pehle se paid hai.');
  }
  if (payment.status === 'REFUNDED') {
    throw new AppError('CONFLICT', 'Refunded payment ko paid nahi kiya ja sakta.');
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      recordedByUserId: params.actorUserId,
      metadata: { ...(payment.metadata as object), settlementNote: params.note ?? null },
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYMENT_RECORDED,
    entity: 'Payment',
    entityId: payment.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { bookingId: payment.bookingId, settled: true, note: params.note ?? null },
  });

  return updated;
}

/**
 * Refund, fully or partially. Staff-only; the caller must already have checked
 * the `payment:refund` permission.
 */
export async function refundPayment(params: {
  paymentId: string;
  amountPaisa: number;
  reason: string;
  actorUserId: string;
  actorRole: Role;
}): Promise<{ payment: Payment; instructions?: string }> {
  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment record nahi mila.');
  if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new AppError('CONFLICT', 'Sirf paid payment refund ho sakti hai.');
  }

  const remaining = payment.amountPaisa - payment.refundedPaisa;
  if (params.amountPaisa <= 0 || params.amountPaisa > remaining) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Refund amount available balance se zyada nahi ho sakta.',
    );
  }

  const provider = paymentProvider(payment.method);
  const result = await provider.refund({
    paymentId: payment.id,
    externalRef: payment.externalRef,
    amountPaisa: params.amountPaisa,
    reason: params.reason,
  });
  if (result.kind === 'FAILED') {
    throw new AppError('INTEGRATION_FAILED', result.reason);
  }

  const refundedTotal = payment.refundedPaisa + params.amountPaisa;
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedPaisa: refundedTotal,
      status: refundedTotal >= payment.amountPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
    entity: 'Payment',
    entityId: payment.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: {
      bookingId: payment.bookingId,
      amountPaisa: params.amountPaisa,
      reason: params.reason,
      outcome: result.kind,
    },
  });

  return {
    payment: updated,
    instructions: result.kind === 'MANUAL_REQUIRED' ? result.instructions : undefined,
  };
}

/** Configuration status of every driver — surfaced in the admin dashboard. */
export function paymentProviderStatus() {
  return Object.values(PROVIDERS).map((provider) => ({
    key: provider.key,
    method: provider.method,
    label: provider.label,
    configured: provider.isConfigured(),
  }));
}
