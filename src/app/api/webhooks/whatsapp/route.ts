import { NextResponse } from 'next/server';
import { integrations } from '@/lib/env';
import {
  handleInboundMessage,
  parseWebhookPayload,
  sendWhatsappText,
  verifySubscription,
  verifyWhatsappSignature,
} from '@/lib/whatsapp';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/**
 * WhatsApp Cloud API webhook.
 *
 * Not wrapped in `route()`: Meta expects bare 200/403 responses, not the
 * platform's JSON envelope, and CSRF does not apply — this endpoint
 * authenticates by HMAC signature over the raw body instead.
 */

/** Meta's subscription handshake. */
export async function GET(request: Request) {
  if (!integrations.whatsapp.inboundConfigured) {
    return new NextResponse('WhatsApp inbound not configured', { status: 503 });
  }
  const result = verifySubscription(new URL(request.url).searchParams);
  if (!result.ok) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(result.challenge, { status: 200 });
}

export async function POST(request: Request) {
  if (!integrations.whatsapp.inboundConfigured) {
    return new NextResponse('WhatsApp inbound not configured', { status: 503 });
  }

  // The raw body is required: re-serialising JSON would change the bytes the
  // signature was computed over.
  const rawBody = await request.text();
  const verification = verifyWhatsappSignature(rawBody, request.headers.get('x-hub-signature-256'));
  if (!verification.valid) {
    console.warn('[webhook:whatsapp] rejected', { reason: verification.reason });
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const limit = await checkRateLimit(RATE_LIMITS.webhook, 'whatsapp');
  if (!limit.allowed) return new NextResponse('Too many requests', { status: 429 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  const messages = parseWebhookPayload(payload);

  // Acknowledge fast and process sequentially: Meta retries aggressively on a
  // slow response, which would duplicate conversation turns.
  for (const message of messages) {
    try {
      const reply = await handleInboundMessage(message);
      const sent = await sendWhatsappText(message.from, reply.text);
      if (!sent.sent) {
        console.warn('[webhook:whatsapp] reply not delivered', { reason: sent.reason });
      }
    } catch (error) {
      console.error('[webhook:whatsapp] handler failed', {
        messageId: message.messageId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
