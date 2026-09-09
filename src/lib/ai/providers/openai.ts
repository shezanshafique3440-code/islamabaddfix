import { env, integrations } from '../../env';
import { AppError } from '../../errors';
import type { LlmProvider } from '../types';

/**
 * OpenAI-compatible driver, using JSON mode. Works against the OpenAI API and
 * any gateway that mirrors `/v1/chat/completions` (set AI_BASE_URL).
 *
 * Present so the platform is not locked to one vendor; the intake code above it
 * does not know which provider answered.
 */
export const openaiProvider: LlmProvider = {
  name: 'openai',
  isConfigured: () => integrations.ai.configured && env.AI_PROVIDER === 'openai',

  async complete({ systemPrompt, userPrompt }) {
    if (!this.isConfigured()) {
      throw new AppError('INTEGRATION_NOT_CONFIGURED', 'AI provider configured nahi hai.');
    }

    const baseUrl = env.AI_BASE_URL ?? 'https://api.openai.com';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.AI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new AppError('INTEGRATION_FAILED', 'AI assistant is waqt jawab nahi de saka.', {
          context: { status: response.status, detail: detail.slice(0, 400) },
        });
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('INTEGRATION_FAILED', 'AI assistant ka jawab khali tha.');
      }
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new AppError('INTEGRATION_FAILED', 'AI assistant ka jawab valid JSON nahi tha.');
      }
    } finally {
      clearTimeout(timeout);
    }
  },
};
