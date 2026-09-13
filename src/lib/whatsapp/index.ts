import { createHmac, timingSafeEqual } from 'crypto';
import { env, integrations } from '../env';
import { prisma } from '../db';
import { runIntake } from '../ai';
import { normalizePhone } from '../auth/service';
import { listZones } from '../catalogue';

/**
 * WhatsApp intake.
 *
 * Architecture, in the order a message travels:
 *   Meta webhook -> signature verification -> conversation lookup by phone
 *   -> intake state machine (below) -> reply queued through the notification
 *   WhatsApp channel.
 *
 * The state machine collects service, location, description and preferred time,
 * then creates a *draft* the customer confirms in the app. It deliberately does
 * not create a confirmed booking from WhatsApp alone: the number is not proof of
 * account ownership, and a booking commits someone to paying a technician.
 *
 * With no credentials configured, `isConfigured()` is false and the webhook
 * route rejects requests instead of half-processing them.
 */

export const whatsappStatus = () => ({
  outbound: integrations.whatsapp.configured,
  inbound: integrations.whatsapp.inboundConfigured,
});

/**
 * Verify Meta's `X-Hub-Signature-256` over the raw body. Compared in constant
 * time; the raw string must be used, not a re-serialised object.
 */
export function verifyWhatsappSignature(
  rawBody: string,
  signatureHeader: string | null,
): { valid: boolean; reason?: string } {
  if (!env.WHATSAPP_APP_SECRET) {
    return { valid: false, reason: 'WHATSAPP_APP_SECRET is not set.' };
  }
  if (!signatureHeader?.startsWith('sha256=')) {
    return { valid: false, reason: 'The signature header is missing or badly formatted.' };
  }
  const provided = signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'The signature does not match.' };
  }
  return { valid: true };
}

/** Meta's GET verification handshake. */
export function verifySubscription(params: URLSearchParams): { ok: boolean; challenge?: string } {
  if (!env.WHATSAPP_VERIFY_TOKEN) return { ok: false };
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// -------------------------------------------------------------- state machine

export type IntakeStep =
  'greeting' | 'service' | 'location' | 'description' | 'time' | 'confirm' | 'done';

export interface WhatsappIntakeState {
  step: IntakeStep;
  serviceSlug?: string;
  serviceName?: string;
  categorySlug?: string;
  zoneSlug?: string;
  zoneName?: string;
  description?: string;
  preferredTime?: string;
  urgency?: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  /** Set once a draft exists, so a repeat message does not create another. */
  draftReference?: string;
  turns: number;
}

const MAX_TURNS = 14;

export interface InboundMessage {
  from: string;
  text: string;
  /** Meta media id, when the customer sent a photo. */
  mediaId?: string;
  messageId: string;
}

export interface IntakeReply {
  text: string;
  state: WhatsappIntakeState;
  /** Set when the conversation produced a draft the customer should confirm. */
  draftUrl?: string;
}

/**
 * Advance the conversation one turn.
 *
 * Kept pure with respect to WhatsApp: it takes text, returns text plus the new
 * state. That makes it testable and reusable by the voice agent, which needs
 * exactly the same slot-filling logic.
 */
export async function handleInboundMessage(message: InboundMessage): Promise<IntakeReply> {
  const phone = normalizePhone(message.from);
  const conversation = await prisma.conversation.upsert({
    where: { kind_externalRef: { kind: 'WHATSAPP_INTAKE', externalRef: phone } },
    create: {
      kind: 'WHATSAPP_INTAKE',
      externalRef: phone,
      subject: 'WhatsApp intake',
      intakeState: { step: 'greeting', turns: 0 } as object,
    },
    update: {},
  });

  const state: WhatsappIntakeState = (conversation.intakeState as WhatsappIntakeState | null) ?? {
    step: 'greeting',
    turns: 0,
  };

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      body: message.text,
      systemAuthor: null,
      // Inbound messages have no platform user until the number is linked.
      senderUserId: null,
    },
  });

  const next = await advance(state, message.text);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      body: next.text,
      systemAuthor: 'assistant',
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { intakeState: next.state as object, lastMessageAt: new Date() },
  });

  return next;
}

async function advance(state: WhatsappIntakeState, text: string): Promise<IntakeReply> {
  const turns = state.turns + 1;
  if (turns > MAX_TURNS) {
    return {
      text:
        'This conversation has gone on a while. It is easier to finish the booking in the app: ' +
        `${env.NEXT_PUBLIC_APP_URL}/book`,
      state: { ...state, step: 'done', turns },
    };
  }

  const trimmed = text.trim();

  switch (state.step) {
    case 'greeting':
    case 'service': {
      // The same intake engine the web app uses, so classification and safety
      // rails behave identically on both surfaces.
      const intake = await runIntake({ message: trimmed });

      if (intake.safetyNotice) {
        return {
          text: `${intake.safetyNotice}\n\nAre you safe right now? We are finding an emergency technician.`,
          state: { ...state, step: 'location', urgency: 'EMERGENCY', description: trimmed, turns },
        };
      }

      if (!intake.serviceSlug && !intake.categorySlug) {
        return {
          text:
            'Hello! I am the Islamabad Fix assistant.\n\n' +
            'Tell us where the problem is — AC, electrical, plumbing, cleaning, carpentry, appliances or CCTV?',
          state: { ...state, step: 'service', turns },
        };
      }

      const service = intake.serviceSlug
        ? await prisma.service.findFirst({
            where: { slug: intake.serviceSlug, isActive: true, deletedAt: null },
            select: { slug: true, name: true, category: { select: { slug: true } } },
          })
        : null;

      return {
        text:
          `${intake.reply}\n\n` +
          'Which sector or area of Islamabad are you in? (for example G-10, F-11, Bahria Town)',
        state: {
          ...state,
          step: 'location',
          serviceSlug: service?.slug,
          serviceName: service?.name,
          categorySlug: intake.categorySlug ?? undefined,
          description: trimmed,
          urgency: intake.urgency,
          turns,
        },
      };
    }

    case 'location': {
      const zones = await listZones({ activeOnly: true });
      const needle = trimmed.toLowerCase().replace(/\s+/g, '');
      const zone = zones.find((z) => {
        const name = z.name.toLowerCase().replace(/\s+/g, '');
        return needle.includes(name) || name.includes(needle);
      });

      if (!zone) {
        const examples = zones
          .slice(0, 8)
          .map((z) => z.name)
          .join(', ');
        return {
          text:
            'We could not find this area in our list. Pick one of these or type your sector:\n' +
            `${examples}${zones.length > 8 ? ' …' : ''}`,
          state: { ...state, step: 'location', turns },
        };
      }

      return {
        text:
          `${zone.name} — got it.\n\n` +
          'Describe the problem in a little detail. If you can send a photo, the technician will bring the right parts.',
        state: { ...state, step: 'description', zoneSlug: zone.slug, zoneName: zone.name, turns },
      };
    }

    case 'description': {
      return {
        text: 'Thanks. When do you need the technician? (for example: "today at 5pm", "tomorrow morning", or "as soon as possible")',
        state: {
          ...state,
          step: 'time',
          description: `${state.description ?? ''}\n${trimmed}`.trim(),
          turns,
        },
      };
    }

    case 'time': {
      const draft = await createDraft({ ...state, preferredTime: trimmed, turns });
      return {
        text:
          'Got everything we need:\n' +
          `• Service: ${state.serviceName ?? state.categorySlug ?? 'to be confirmed'}\n` +
          `• Area: ${state.zoneName ?? '—'}\n` +
          `• Time: ${trimmed}\n\n` +
          'Open this link to confirm the booking and see verified technicians — ' +
          'for security the final booking always happens in the app:\n' +
          draft.url,
        state: {
          ...state,
          step: 'done',
          preferredTime: trimmed,
          draftReference: draft.reference,
          turns,
        },
        draftUrl: draft.url,
      };
    }

    case 'confirm':
    case 'done':
    default: {
      return {
        text:
          'Your request is already in. Tell us if something new comes up, or check the booking in the app: ' +
          `${env.NEXT_PUBLIC_APP_URL}/account/bookings`,
        state: { ...state, step: 'done', turns },
      };
    }
  }
}

/**
 * Hand the collected slots to the web booking flow as a prefilled link.
 *
 * No Booking row is written here on purpose: a phone number is not
 * authentication, and creating a real booking would commit an unverified party
 * to paying a technician.
 */
async function createDraft(
  state: WhatsappIntakeState,
): Promise<{ url: string; reference: string }> {
  const params = new URLSearchParams();
  if (state.serviceSlug) params.set('service', state.serviceSlug);
  else if (state.categorySlug) params.set('category', state.categorySlug);
  if (state.zoneSlug) params.set('zone', state.zoneSlug);
  if (state.description) params.set('problem', state.description.slice(0, 400));
  if (state.urgency === 'EMERGENCY') params.set('emergency', '1');
  params.set('via', 'whatsapp');

  const reference = `WA-${Date.now().toString(36).toUpperCase()}`;
  return { url: `${env.NEXT_PUBLIC_APP_URL}/book?${params.toString()}`, reference };
}

/** Send a WhatsApp text through the Cloud API. */
export async function sendWhatsappText(
  to: string,
  body: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (!integrations.whatsapp.configured) {
    return { sent: false, reason: 'WhatsApp outbound is not configured.' };
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
          to: normalizePhone(to).replace('+', ''),
          type: 'text',
          text: { body },
        }),
      },
    );
    if (!response.ok) {
      return {
        sent: false,
        reason: `WhatsApp ${response.status}: ${(await response.text()).slice(0, 200)}`,
      };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Extract the text messages from a Cloud API webhook payload. */
export function parseWebhookPayload(payload: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id: string;
            from: string;
            type: string;
            text?: { body: string };
            image?: { id: string };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type === 'text' && message.text?.body) {
          messages.push({ from: message.from, text: message.text.body, messageId: message.id });
        } else if (message.type === 'image' && message.image?.id) {
          // An image with no caption still advances the conversation.
          messages.push({
            from: message.from,
            text: '[photo sent]',
            mediaId: message.image.id,
            messageId: message.id,
          });
        }
      }
    }
  }
  return messages;
}
