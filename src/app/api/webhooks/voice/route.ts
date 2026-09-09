import { NextResponse } from 'next/server';
import { integrations } from '@/lib/env';
import { executeVoiceTool, verifyVoiceSignature } from '@/lib/voice';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/**
 * Voice agent webhook (Vapi-compatible tool-call transport).
 *
 * Authenticates by HMAC over the raw body. Only the tools declared in
 * src/lib/voice are executable; anything else comes back as an explicit refusal
 * the agent can read out.
 */
export async function POST(request: Request) {
  if (!integrations.voice.inboundConfigured) {
    return NextResponse.json(
      { error: 'Voice agent is deployment par configured nahi hai.' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const verification = verifyVoiceSignature(
    rawBody,
    request.headers.get('x-vapi-signature') ?? request.headers.get('x-signature'),
  );
  if (!verification.valid) {
    console.warn('[webhook:voice] rejected', { reason: verification.reason });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const limit = await checkRateLimit(RATE_LIMITS.webhook, 'voice');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let payload: {
    message?: {
      type?: string;
      toolCalls?: Array<{ id: string; function?: { name: string; arguments?: unknown } }>;
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const toolCalls = payload.message?.toolCalls ?? [];
  if (toolCalls.length === 0) {
    // Status callbacks (call started/ended) need only an acknowledgement.
    return NextResponse.json({ received: true });
  }

  const results = [];
  for (const call of toolCalls) {
    const name = call.function?.name ?? '';
    const args =
      typeof call.function?.arguments === 'string'
        ? safeParse(call.function.arguments)
        : ((call.function?.arguments as Record<string, unknown>) ?? {});
    try {
      const outcome = await executeVoiceTool({ name, arguments: args });
      results.push({ toolCallId: call.id, result: outcome.result });
    } catch (error) {
      console.error('[webhook:voice] tool failed', { name, error });
      results.push({
        toolCallId: call.id,
        result: { error: 'Yeh maloomat is waqt hasil nahi ho saki.' },
      });
    }
  }

  return NextResponse.json({ results });
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
