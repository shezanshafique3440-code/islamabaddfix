import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../errors';
import { env, integrations } from '../env';
import { readFileBytes } from '../storage';
import { DIAGNOSIS_DISCLAIMER, sanitizeAssistantMessage } from './safety';

/**
 * Photo assessment.
 *
 * What this is: a second pair of eyes that helps a technician arrive prepared.
 * It reads the visible facts off a photo — a model number, a corroded fitting,
 * water where water should not be — and says what the job is likely to need.
 *
 * What it is emphatically not: a diagnosis. The same two rules that govern the
 * text assistant apply verbatim, because a photo makes a model *more* confident
 * and no more correct. It never names a failed component as fact and it never
 * gives a repair instruction. Every result carries the disclaimer.
 *
 * With no vision-capable model configured this returns a clearly-labelled
 * unavailable state. The photo still reaches the technician, which was always
 * the point of asking for one.
 */

export const photoAssessmentSchema = z.object({
  /** Plainly what can be seen. No inference dressed up as observation. */
  observations: z.array(z.string().max(200)).max(6),
  /** Any model, rating-plate or error text legible in the image. */
  identifiers: z.array(z.string().max(80)).max(6),
  /** What the technician should bring or expect. Never an instruction to the customer. */
  technicianNotes: z.array(z.string().max(200)).max(6),
  /** Visible hazard, if any. Drives a prominent warning rather than a repair tip. */
  hazard: z.string().max(300).nullable(),
  /** 0-1. The UI says "unclear photo" below ~0.4 rather than guessing louder. */
  confidence: z.number().min(0).max(1),
  /** One short sentence for the customer. */
  summary: z.string().max(400),
});

export type PhotoAssessment = z.infer<typeof photoAssessmentSchema>;

export interface PhotoAssessmentResult {
  available: boolean;
  assessment: PhotoAssessment | null;
  /** Always present, always shown: this is not a diagnosis. */
  disclaimer: string;
  /** Why there is no assessment, when there is none. */
  unavailableReason: string | null;
}

const VISION_PROMPT = `You are looking at a photo a customer sent with a home-services request in Islamabad, Pakistan.

Report only what is VISIBLE. Read any model number, rating plate or error code you can actually make out.

You MUST NOT:
- State a definitive diagnosis. "The capacitor has failed" is forbidden; "corrosion is visible around the terminal" is fine.
- Give the customer any repair, disassembly, wiring, gas or refrigerant instruction.
- Estimate a price.
- Claim certainty you do not have. Lower your confidence instead.

If something in the photo looks dangerous — scorching, exposed conductors, a gas fitting, standing water near electrics — put it in \`hazard\` as an observation plus "have a qualified technician inspect it", and nothing more.

Respond ONLY with a JSON object matching the schema.`;

/** Image types a vision model will actually accept. */
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const visionStatus = () => ({
  // Vision rides on the same provider and key as intake; only Anthropic's
  // driver here speaks images, so an OpenAI key is honestly reported as no.
  configured: integrations.ai.configured && env.AI_PROVIDER === 'anthropic',
  provider: env.AI_PROVIDER,
});

/**
 * Assess one uploaded photo.
 *
 * The caller must own the file — the same ownership rule as every other file
 * read in this codebase. A booking-scoped file may also be read by the assigned
 * technician, which is handled by passing that booking's id.
 */
export async function assessPhoto(params: {
  fileId: string;
  requesterId: string;
}): Promise<PhotoAssessmentResult> {
  const file = await prisma.uploadedFile.findFirst({
    where: {
      id: params.fileId,
      deletedAt: null,
      OR: [
        { ownerId: params.requesterId },
        { booking: { provider: { userId: params.requesterId } } },
      ],
    },
  });
  if (!file) throw new AppError('NOT_FOUND', 'File not found.');

  if (!SUPPORTED.has(file.mimeType)) {
    return unavailable('Only JPEG, PNG and WebP photos can be assessed.');
  }
  if (!visionStatus().configured) {
    return unavailable(
      'No vision model is configured on this deployment, so photos are not assessed automatically. Your technician still sees every photo you send.',
    );
  }

  const { body } = await readFileBytes(file);
  const raw = await requestAssessment(body.toString('base64'), file.mimeType);

  const parsed = photoAssessmentSchema.safeParse(raw);
  if (!parsed.success) {
    return unavailable('The assessment came back in a shape we could not read.');
  }

  // The output filter runs on model prose here exactly as it does on intake
  // replies: a photo is not a reason to relax the repair-instruction rule.
  const summary = sanitizeAssistantMessage(parsed.data.summary);
  const hazard = parsed.data.hazard ? sanitizeAssistantMessage(parsed.data.hazard) : null;

  return {
    available: true,
    assessment: {
      ...parsed.data,
      summary: summary.message,
      hazard: hazard?.message ?? null,
    },
    disclaimer: DIAGNOSIS_DISCLAIMER,
    unavailableReason: null,
  };
}

function unavailable(reason: string): PhotoAssessmentResult {
  return {
    available: false,
    assessment: null,
    disclaimer: DIAGNOSIS_DISCLAIMER,
    unavailableReason: reason,
  };
}

const ASSESSMENT_TOOL = {
  name: 'record_photo_assessment',
  description: 'Record what is visible in a customer-supplied photo.',
  input_schema: {
    type: 'object' as const,
    properties: {
      observations: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      identifiers: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      technicianNotes: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      hazard: { type: ['string', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      summary: { type: 'string', maxLength: 400 },
    },
    required: ['observations', 'identifiers', 'technicianNotes', 'hazard', 'confidence', 'summary'],
  },
};

async function requestAssessment(base64: string, mediaType: string): Promise<unknown> {
  const baseUrl = env.AI_BASE_URL ?? 'https://api.anthropic.com';
  const controller = new AbortController();
  // A customer is waiting on this; a slow model must not hang the request.
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': env.AI_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 1024,
        system: VISION_PROMPT,
        tools: [ASSESSMENT_TOOL],
        tool_choice: { type: 'tool', name: ASSESSMENT_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Assess this photo.' },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new AppError('INTEGRATION_FAILED', 'The photo could not be assessed just now.', {
        context: { status: response.status, detail: detail.slice(0, 400) },
      });
    }

    const json = (await response.json()) as {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
    };
    const toolUse = json.content?.find(
      (block) => block.type === 'tool_use' && block.name === ASSESSMENT_TOOL.name,
    );
    return toolUse?.input ?? null;
  } finally {
    clearTimeout(timeout);
  }
}
