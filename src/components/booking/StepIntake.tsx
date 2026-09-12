'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Badge } from '@/components/ui/Badge';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { StepFooter, StepShell } from './WizardProgress';
import type { BookingDraft, WizardCatalogue } from './types';

interface IntakeResponse {
  categorySlug: string | null;
  serviceSlug: string | null;
  issueSummary: string;
  urgency: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  confidence: number;
  questions: string[];
  mediaRequest: string | null;
  recommendation: string;
  reply: string;
  source: 'llm' | 'rules';
  degraded: boolean;
  safetyNotice: string | null;
  disclaimer: string;
  category: { id: string; name: string; slug: string; iconKey: string } | null;
  service: { id: string; name: string; slug: string } | null;
}

/**
 * Step 1 — describe the problem.
 *
 * The assistant is honest about which engine answered. When no LLM is
 * configured the response comes from the rule-based classifier and the UI says
 * so, rather than dressing up keyword matching as AI.
 *
 * Its conclusion is always a suggestion the customer confirms — never an
 * automatic jump — and it carries the "not a diagnosis" disclaimer.
 */
export function StepIntake({
  draft,
  patch,
  catalogue,
  aiConfigured,
  onNext,
  onSkip,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  catalogue: WizardCatalogue;
  aiConfigured: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState(draft.problem);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    const message = text.trim();
    if (message.length < 3) {
      setError('Apna masla thoda tafseel se likhein.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<IntakeResponse>('/api/ai/intake', { message });
      setResult(response);
      patch({
        problem: message,
        categorySlug: response.categorySlug,
        // Only preselect the service when the classifier is reasonably sure;
        // otherwise the customer picks it on the next step.
        serviceId: response.confidence >= 0.45 ? (response.service?.id ?? null) : null,
        urgency: response.urgency,
        isEmergency: response.urgency === 'EMERGENCY' ? draft.isEmergency : draft.isEmergency,
        intakeSummary: {
          issueSummary: response.issueSummary,
          urgency: response.urgency,
          recommendation: response.recommendation,
          confidence: response.confidence,
          source: response.source,
          categorySlug: response.categorySlug,
          serviceSlug: response.serviceSlug,
        },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Assistant se jawab nahi mila. Aap seedha category chun sakte hain.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <StepShell
      title="Masla batayein"
      description="Apne alfaz mein likhein — Roman Urdu ya English, jo aasan lage."
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="problem" className="sr-only">
            Aapko kis cheez ki help chahiye?
          </label>
          <textarea
            id="problem"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            placeholder="Misal: AC chal raha hai lekin thandi hawa nahi aa rahi."
            className="w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-ink-900 placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-600"
          />
          {error ? (
            <p role="alert" className="mt-1.5 text-sm text-alert-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={analyse}
            disabled={loading || text.trim().length < 3}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
          >
            {loading ? 'Dekh rahe hain...' : 'Yeh dekhein'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-ink-600 hover:text-ink-900 hover:underline"
          >
            Ya seedha category chunein →
          </button>
        </div>

        {/* Honest statement of which engine is answering. */}
        <p className="text-xs text-ink-500">
          {aiConfigured
            ? 'AI assistant is deployment par configured hai.'
            : 'Is deployment par AI model configured nahi hai — yeh keyword-based matching hai, AI nahi. Phir bhi kaam karta hai.'}
        </p>

        {result ? (
          <div className="space-y-3">
            {result.safetyNotice ? (
              <div role="alert" className="rounded-xl border-2 border-alert-400 bg-alert-50 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-alert-700">
                  <span aria-hidden="true">⚠️</span> Pehle safety
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-800">{result.safetyNotice}</p>
              </div>
            ) : null}

            <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-relaxed text-ink-800">{result.reply}</p>
                <Badge tone={result.source === 'llm' ? 'info' : 'neutral'} className="shrink-0">
                  {result.source === 'llm' ? 'AI' : 'Rule-based'}
                </Badge>
              </div>

              {result.degraded ? (
                <p className="mt-2 text-xs text-warn-700">
                  AI se jawab nahi mila, is liye keyword matching istemal hui.
                </p>
              ) : null}

              {result.category ? (
                <dl className="mt-4 grid gap-3 border-t border-ink-200 pt-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2.5">
                    <ServiceIconTile iconKey={result.category.iconKey} size="sm" />
                    <div>
                      <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-400">
                        Category
                      </dt>
                      <dd className="text-sm font-semibold text-ink-900">{result.category.name}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-400">
                      Urgency
                    </dt>
                    <dd className="mt-0.5">
                      <Badge
                        tone={
                          result.urgency === 'EMERGENCY'
                            ? 'danger'
                            : result.urgency === 'URGENT'
                              ? 'warn'
                              : 'neutral'
                        }
                      >
                        {result.urgency === 'EMERGENCY'
                          ? 'Emergency'
                          : result.urgency === 'URGENT'
                            ? 'Urgent'
                            : 'Normal'}
                      </Badge>
                    </dd>
                  </div>
                  {result.service ? (
                    <div>
                      <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-400">
                        Service
                      </dt>
                      <dd className="text-sm font-semibold text-ink-900">{result.service.name}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-400">
                      Tajweez
                    </dt>
                    <dd className="text-sm text-ink-800">{result.recommendation}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-ink-600">
                  Category clear nahi hui — agle step par khud chun lein.
                </p>
              )}

              {result.questions.length > 0 ? (
                <div className="mt-4 border-t border-ink-200 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Technician ko yeh jaanna madadgar hoga
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {result.questions.map((question) => (
                      <li key={question} className="flex gap-2 text-sm text-ink-700">
                        <span aria-hidden="true" className="text-ink-400">
                          •
                        </span>
                        {question}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-500">
                    Inke jawab agle step par tafseel mein likh dein.
                  </p>
                </div>
              ) : null}

              {result.mediaRequest ? (
                <p className="mt-3 border-t border-ink-200 pt-3 text-sm text-ink-700">
                  📷 {result.mediaRequest}
                </p>
              ) : null}

              {/* Non-negotiable: this is never presented as a diagnosis. */}
              <p className="mt-3 border-t border-ink-200 pt-3 text-xs leading-relaxed text-ink-500">
                {result.disclaimer}
              </p>
            </div>

            {catalogue.length > 0 && !result.category ? (
              <p className="text-sm text-ink-600">
                Aap agle step par apni category chun sakte hain.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <StepFooter
        onNext={() => {
          patch({ problem: text.trim() });
          onNext();
        }}
        nextDisabled={text.trim().length < 10}
        nextLabel={result?.service ? 'Aage barhein' : 'Category chunein'}
      />
    </StepShell>
  );
}
