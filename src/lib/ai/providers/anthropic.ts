import { env, integrations } from '../../env';
import { AppError } from '../../errors';
import type { LlmProvider } from '../types';

/**
 * Anthropic Messages API driver.
 *
 * Called over plain fetch rather than the SDK: one JSON request with a forced
 * tool call is all the intake assistant needs, and this keeps the server bundle
 * small. The API key is read server-side only and never reaches the browser.
 */

const INTAKE_TOOL = {
  name: 'record_intake',
  description: 'Record the structured intake assessment for a customer service request.',
  input_schema: {
    type: 'object' as const,
    properties: {
      categorySlug: { type: ['string', 'null'], description: 'Slug of the matched category.' },
      serviceSlug: { type: ['string', 'null'], description: 'Slug of the matched service.' },
      issueSummary: { type: 'string', maxLength: 280 },
      urgency: { type: 'string', enum: ['NORMAL', 'URGENT', 'EMERGENCY'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      questions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      mediaRequest: { type: ['string', 'null'] },
      recommendation: { type: 'string', maxLength: 160 },
      reply: { type: 'string', maxLength: 900 },
    },
    required: [
      'categorySlug',
      'serviceSlug',
      'issueSummary',
      'urgency',
      'confidence',
      'questions',
      'mediaRequest',
      'recommendation',
      'reply',
    ],
  },
};

export const anthropicProvider: LlmProvider = {
  name: 'anthropic',
  isConfigured: () => integrations.ai.configured && env.AI_PROVIDER === 'anthropic',

  async complete({ systemPrompt, userPrompt }) {
    if (!this.isConfigured()) {
      throw new AppError('INTEGRATION_NOT_CONFIGURED', 'AI provider configured nahi hai.');
    }

    const baseUrl = env.AI_BASE_URL ?? 'https://api.anthropic.com';
    const controller = new AbortController();
    // Intake happens while a customer waits; a slow model must not hang the request.
    const timeout = setTimeout(() => controller.abort(), 20_000);

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
          system: systemPrompt,
          tools: [INTAKE_TOOL],
          tool_choice: { type: 'tool', name: INTAKE_TOOL.name },
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new AppError(
          'INTEGRATION_FAILED',
          'AI assistant is waqt jawab nahi de saka.',
          { context: { status: response.status, detail: detail.slice(0, 400) } },
        );
      }

      const json = (await response.json()) as {
        content?: Array<{ type: string; name?: string; input?: unknown }>;
      };
      const toolUse = json.content?.find(
        (block) => block.type === 'tool_use' && block.name === INTAKE_TOOL.name,
      );
      if (!toolUse?.input) {
        throw new AppError('INTEGRATION_FAILED', 'AI assistant ka jawab samajh nahi aaya.');
      }
      return toolUse.input;
    } finally {
      clearTimeout(timeout);
    }
  },
};
