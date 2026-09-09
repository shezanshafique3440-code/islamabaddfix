import { z } from 'zod';

/**
 * Structured output of the intake assistant.
 *
 * The same shape is produced by both paths — the LLM and the rule-based
 * classifier — so the UI and the booking flow never branch on which one ran.
 * `source` tells the UI what to be honest about.
 */

export const intakeResultSchema = z.object({
  /** Slug of the best-matching service category, if one was identified. */
  categorySlug: z.string().nullable(),
  /** Slug of a specific service within that category, when confident enough. */
  serviceSlug: z.string().nullable(),
  /** Short, non-committal description of the issue. */
  issueSummary: z.string().max(280),
  urgency: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']),
  /** 0-1. Below ~0.45 the UI asks the customer to confirm the category. */
  confidence: z.number().min(0).max(1),
  /** Clarifying questions to put to the customer, in Roman Urdu. */
  questions: z.array(z.string().max(200)).max(3),
  /** Why a photo/video would help, in Roman Urdu. Null when not needed. */
  mediaRequest: z.string().max(200).nullable(),
  /** What the platform recommends, e.g. "AC inspection / service". */
  recommendation: z.string().max(160),
  /** Assistant's conversational reply. */
  reply: z.string().max(900),
});

export type IntakeResult = z.infer<typeof intakeResultSchema>;

export interface IntakeContext {
  /** Prior turns, oldest first. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Catalogue the assistant is allowed to choose from. */
  catalogue: Array<{
    categorySlug: string;
    categoryName: string;
    services: Array<{ slug: string; name: string }>;
  }>;
}

export type IntakeSource = 'llm' | 'rules';

export interface IntakeResponse extends IntakeResult {
  source: IntakeSource;
  /** True when an LLM is configured but the call failed and rules took over. */
  degraded: boolean;
  /** Set when a hazard was detected; shown as a prominent safety notice. */
  safetyNotice: string | null;
  /** True when the assistant's own wording was replaced by the safety filter. */
  wasFiltered: boolean;
}

export interface LlmProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Returns the parsed structured result, or throws. */
  complete(input: { systemPrompt: string; userPrompt: string }): Promise<unknown>;
}
