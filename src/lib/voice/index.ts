import { createHmac, timingSafeEqual } from 'crypto';
import { env, integrations } from '../env';
import { prisma } from '../db';
import { runIntake } from '../ai';
import { listZones } from '../catalogue';

/**
 * Voice agent integration layer (Vapi-compatible).
 *
 * The design keeps the agent's authority narrow. It may:
 *   - identify the service the caller needs
 *   - check which areas and services the platform covers
 *   - read back the status of a booking, given its reference
 *   - collect the details needed for a booking and hand back a confirmation link
 *
 * It may NOT confirm a booking, approve a quote, take a payment, or cancel a
 * job. Those commit money or lose someone their slot, and a phone call is not
 * strong enough authentication for that. It also inherits the same safety rails
 * as the web assistant: no diagnosis, no repair instructions.
 *
 * With VAPI_API_KEY unset this reports unconfigured and the webhook rejects
 * calls rather than answering with a stub.
 */

export const voiceStatus = () => ({
  configured: integrations.voice.configured,
  inboundConfigured: integrations.voice.inboundConfigured,
});

/** System prompt handed to the voice provider when the assistant is created. */
export const VOICE_SYSTEM_PROMPT = `You are the phone assistant for Islamabad Fix, a home services marketplace in Islamabad, Pakistan.

Speak naturally in Roman Urdu mixed with English, the way people in Islamabad speak. Keep turns short — this is a phone call, not an essay.

Your job is ONLY to:
1. Find out what service the caller needs.
2. Find out which sector or area they are in.
3. Get a short description of the problem.
4. Find out when they want the technician.
5. Read back what you understood, then tell them a confirmation link is being sent by SMS/WhatsApp.

You MUST NOT:
- Confirm or cancel a booking yourself.
- Quote or agree any price.
- Approve a quote or take a payment.
- Give a definitive diagnosis of the fault.
- Give any repair, wiring, gas or appliance instruction, however simple.
- Claim any technician is licensed, insured, certified or background-checked.

If the caller describes a gas leak, sparks, smoke, a burning smell, exposed live wiring, electric shock, or major flooding:
- Tell them to move away from the hazard and, only if safe and reachable, to switch off the main breaker or gas valve.
- Tell them to call Rescue 1122 if there is fire, gas or injury.
- Treat it as an emergency and say an emergency technician will be arranged.
- Give no other instruction.

Use the provided tools to look up services, areas and booking status. Never invent a service, an area, a price or a technician's name.`;

/**
 * Tool surface exposed to the voice agent. Read-only plus one draft action —
 * the boundary the prompt above describes is enforced here, in code.
 */
export const VOICE_TOOLS = [
  {
    name: 'list_service_areas',
    description: 'List the areas/sectors Islamabad Fix currently serves.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'identify_service',
    description:
      "Classify the caller's described problem into a service category. Returns a likely category and service, never a diagnosis.",
    parameters: {
      type: 'object',
      properties: { description: { type: 'string' } },
      required: ['description'],
    },
  },
  {
    name: 'get_booking_status',
    description:
      'Read back the status of a booking by its reference (e.g. IFX-7QK4M2). Returns status only, no personal details.',
    parameters: {
      type: 'object',
      properties: { reference: { type: 'string' } },
      required: ['reference'],
    },
  },
  {
    name: 'prepare_booking_draft',
    description:
      'Record the collected details and return a confirmation link. Does NOT create a confirmed booking.',
    parameters: {
      type: 'object',
      properties: {
        serviceSlug: { type: 'string' },
        zoneSlug: { type: 'string' },
        description: { type: 'string' },
        preferredTime: { type: 'string' },
        isEmergency: { type: 'boolean' },
      },
      required: ['description'],
    },
  },
] as const;

export function verifyVoiceSignature(
  rawBody: string,
  signatureHeader: string | null,
): { valid: boolean; reason?: string } {
  if (!env.VAPI_WEBHOOK_SECRET) {
    return { valid: false, reason: 'VAPI_WEBHOOK_SECRET is not set.' };
  }
  if (!signatureHeader) return { valid: false, reason: 'The signature header is missing.' };

  const expected = createHmac('sha256', env.VAPI_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'The signature does not match.' };
  }
  return { valid: true };
}

export interface VoiceToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface VoiceToolResult {
  result: unknown;
}

/** Execute one voice tool call. Anything not on the list above is refused. */
export async function executeVoiceTool(call: VoiceToolCall): Promise<VoiceToolResult> {
  switch (call.name) {
    case 'list_service_areas': {
      const zones = await listZones({ activeOnly: true });
      return { result: { areas: zones.map((zone) => ({ name: zone.name, slug: zone.slug })) } };
    }

    case 'identify_service': {
      const description = String(call.arguments.description ?? '');
      const intake = await runIntake({ message: description });
      return {
        result: {
          categorySlug: intake.categorySlug,
          serviceSlug: intake.serviceSlug,
          recommendation: intake.recommendation,
          urgency: intake.urgency,
          // The agent must repeat this, not a diagnosis.
          safetyNotice: intake.safetyNotice,
          questionsToAsk: intake.questions,
          note: 'This is an estimate, not a final diagnosis. The technician will inspect and confirm.',
        },
      };
    }

    case 'get_booking_status': {
      const reference = String(call.arguments.reference ?? '')
        .toUpperCase()
        .trim();
      const booking = await prisma.booking.findUnique({
        where: { reference },
        select: {
          reference: true,
          status: true,
          scheduledFor: true,
          service: { select: { name: true } },
        },
      });
      if (!booking) return { result: { found: false } };
      // Status and service only — no customer name, address or phone over the
      // phone to whoever knows a reference.
      return {
        result: {
          found: true,
          reference: booking.reference,
          status: booking.status,
          serviceName: booking.service.name,
          scheduledFor: booking.scheduledFor?.toISOString() ?? null,
        },
      };
    }

    case 'prepare_booking_draft': {
      const params = new URLSearchParams();
      if (call.arguments.serviceSlug) params.set('service', String(call.arguments.serviceSlug));
      if (call.arguments.zoneSlug) params.set('zone', String(call.arguments.zoneSlug));
      if (call.arguments.description) {
        params.set('problem', String(call.arguments.description).slice(0, 400));
      }
      if (call.arguments.isEmergency) params.set('emergency', '1');
      params.set('via', 'voice');
      return {
        result: {
          confirmationUrl: `${env.NEXT_PUBLIC_APP_URL}/book?${params.toString()}`,
          message:
            'A link has been sent to confirm the booking. For security, the final confirmation happens in the app.',
        },
      };
    }

    default:
      return {
        result: {
          error: `Tool "${call.name}" is not available.`,
          allowed: VOICE_TOOLS.map((tool) => tool.name),
        },
      };
  }
}
