import { NextResponse } from 'next/server';
import { integrations } from '@/lib/env';
import { paymentProvider } from '@/lib/payments';
import { prisma } from '@/lib/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';

/**
 * Payment gateway webhook.
 *
 * Signature-verified, idempotent by external reference, and it only ever moves
 * a Payment forward (PENDING/AUTHORIZED -> PAID/FAILED). A webhook cannot
 * change an amount: the amount was fixed when the payment was created from the
 * booking's server-side total.
 */
export async function POST(request: Request) {
  if (!integrations.onlinePayments.configured) {
    return NextResponse.json({ error: 'Payment gateway configured nahi hai.' }, { status: 503 });
  }

  const rawBody = await request.text();
  const provider = paymentProvider('ONLINE_GATEWAY');
  const verification = provider.verifyWebhook?.(rawBody, request.headers) ?? {
    valid: false,
    reason: 'Is provider ke liye webhook verification implement nahi hui.',
  };
  if (!verification.valid) {
    console.warn('[webhook:payment] rejected', { reason: verification.reason });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const limit = await checkRateLimit(RATE_LIMITS.webhook, 'payment');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let event: { type?: string; data?: { externalRef?: string; status?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const externalRef = event.data?.externalRef;
  if (!externalRef) return NextResponse.json({ error: 'externalRef missing' }, { status: 400 });

  const payment = await prisma.payment.findFirst({ where: { externalRef } });
  if (!payment) {
    // Unknown reference: acknowledge so the gateway stops retrying, but log it.
    console.warn('[webhook:payment] unknown externalRef', { externalRef });
    return NextResponse.json({ received: true, matched: false });
  }

  // Idempotent: a replayed success webhook is a no-op.
  if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
    return NextResponse.json({ received: true, alreadySettled: true });
  }

  const succeeded = event.type === 'payment.succeeded' || event.data?.status === 'paid';
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: succeeded
      ? { status: 'PAID', paidAt: new Date() }
      : { status: 'FAILED', failureReason: String(event.data?.status ?? event.type ?? 'unknown') },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYMENT_RECORDED,
    entity: 'Payment',
    entityId: updated.id,
    metadata: { source: 'gateway_webhook', type: event.type ?? null, status: updated.status },
  });

  return NextResponse.json({ received: true, status: updated.status });
}
