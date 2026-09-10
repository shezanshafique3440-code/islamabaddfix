import { prisma } from '../db';
import { env, integrations } from '../env';
import { getSetting } from '../settings';
import { classifyIntake } from './classifier';
import { anthropicProvider } from './providers/anthropic';
import { openaiProvider } from './providers/openai';
import { assessHazard, sanitizeAssistantMessage, SYSTEM_PROMPT } from './safety';
import { intakeResultSchema, type IntakeContext, type IntakeResponse, type LlmProvider } from './types';

export { DIAGNOSIS_DISCLAIMER } from './safety';
export type { IntakeResponse, IntakeResult } from './types';

const PROVIDERS: Record<string, LlmProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

function activeProvider(): LlmProvider | null {
  const provider = PROVIDERS[env.AI_PROVIDER];
  return provider?.isConfigured() ? provider : null;
}

export const aiStatus = () => ({
  configured: integrations.ai.configured,
  provider: integrations.ai.provider,
});

/** Catalogue the assistant may choose from — active rows only. */
async function loadCatalogue(): Promise<IntakeContext['catalogue']> {
  const categories = await prisma.serviceCategory.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      slug: true,
      name: true,
      services: {
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, name: true },
      },
    },
  });
  return categories.map((category) => ({
    categorySlug: category.slug,
    categoryName: category.name,
    services: category.services,
  }));
}

/**
 * Run one turn of service intake.
 *
 * Order of operations matters:
 *  1. Hazard detection runs first, on the raw text, independent of any model.
 *     A hazard forces EMERGENCY urgency and its own safety guidance — an LLM
 *     cannot talk the system out of that.
 *  2. If an LLM is configured, it produces the structured assessment. If the
 *     call fails or returns something unparseable, we fall back to the
 *     rule-based classifier and report `degraded: true` rather than erroring.
 *  3. The assistant's reply passes through the output safety filter.
 *
 * The result is never presented as a diagnosis; the UI attaches
 * DIAGNOSIS_DISCLAIMER to it.
 */
export async function runIntake(params: {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<IntakeResponse> {
  const enabled = await getSetting('ai.intakeEnabled');
  const maxTurns = await getSetting('ai.maxTurns');
  const history = (params.history ?? []).slice(-maxTurns * 2);
  const catalogue = await loadCatalogue();
  const context: IntakeContext = { history, catalogue };

  const hazard = assessHazard([...history.map((h) => h.content), params.message].join(' '));

  // Rule-based result is computed either way: it is the fallback, and its
  // category guess backstops an LLM that returns a slug we do not recognise.
  const rulesResult = classifyIntake(params.message, context);

  if (!enabled) {
    return finalize(rulesResult, 'rules', false, hazard.guidance ?? null);
  }

  const provider = activeProvider();
  if (!provider) {
    return finalize(rulesResult, 'rules', false, hazard.guidance ?? null);
  }

  try {
    const raw = await provider.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(params.message, context),
    });
    const parsed = intakeResultSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('[ai] provider returned an unusable shape, using rule-based intake', {
        issues: parsed.error.issues.slice(0, 3),
      });
      return finalize(rulesResult, 'rules', true, hazard.guidance ?? null);
    }

    // Guard against hallucinated slugs: anything not in the live catalogue is
    // dropped back to the rule-based guess.
    const validCategory = catalogue.find((c) => c.categorySlug === parsed.data.categorySlug);
    const validService = validCategory?.services.find((s) => s.slug === parsed.data.serviceSlug);
    const result = {
      ...parsed.data,
      categorySlug: validCategory?.categorySlug ?? rulesResult.categorySlug,
      serviceSlug: validService?.slug ?? null,
      // A detected hazard always wins over the model's own urgency call.
      urgency: hazard.isHazard ? ('EMERGENCY' as const) : parsed.data.urgency,
    };
    return finalize(result, 'llm', false, hazard.guidance ?? null);
  } catch (error) {
    console.warn('[ai] intake call failed, using rule-based intake', {
      error: error instanceof Error ? error.message : error,
    });
    return finalize(rulesResult, 'rules', true, hazard.guidance ?? null);
  }
}

function finalize(
  result: ReturnType<typeof classifyIntake>,
  source: 'llm' | 'rules',
  degraded: boolean,
  safetyNotice: string | null,
): IntakeResponse {
  // A hazard's own guidance replaces the conversational reply entirely.
  const baseReply = safetyNotice ?? result.reply;
  const { message, wasFiltered } = sanitizeAssistantMessage(baseReply);
  return {
    ...result,
    reply: message,
    urgency: safetyNotice ? 'EMERGENCY' : result.urgency,
    source,
    degraded,
    safetyNotice,
    wasFiltered,
  };
}

function buildUserPrompt(message: string, context: IntakeContext): string {
  const catalogueText = context.catalogue
    .map(
      (category) =>
        `- ${category.categoryName} (slug: ${category.categorySlug})\n` +
        category.services.map((s) => `    * ${s.name} (slug: ${s.slug})`).join('\n'),
    )
    .join('\n');

  const historyText =
    context.history.length > 0
      ? context.history
          .map((turn) => `${turn.role === 'user' ? 'Customer' : 'Assistant'}: ${turn.content}`)
          .join('\n')
      : '(no previous turns)';

  return `Available service catalogue — you may ONLY use these slugs:
${catalogueText}

Conversation so far:
${historyText}

New customer message:
${message}

Record your intake assessment. Remember: no diagnosis stated as fact, no repair instructions, no prices.`;
}
