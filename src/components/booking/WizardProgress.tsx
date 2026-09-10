'use client';

import { cn } from '@/lib/utils';
import type { WizardStep } from './types';

const LABELS: Record<WizardStep, string> = {
  intake: 'Masla',
  service: 'Service',
  details: 'Tafseel',
  location: 'Location',
  schedule: 'Waqt',
  provider: 'Technician',
  confirm: 'Confirm',
};

/**
 * Step indicator.
 *
 * On a phone this collapses to "Step 3 of 7" plus a progress bar; a seven-item
 * stepper at 360px is unreadable. Completed steps are clickable so someone can
 * go back and fix an answer.
 */
export function WizardProgress({
  steps,
  current,
  onSelect,
}: {
  steps: WizardStep[];
  current: WizardStep;
  onSelect: (step: WizardStep) => void;
}) {
  const index = steps.indexOf(current);
  const percent = ((index + 1) / steps.length) * 100;

  return (
    <div>
      {/* Mobile */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-900">{LABELS[current]}</span>
          <span className="text-ink-500">
            Step {index + 1} / {steps.length}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label="Booking progress"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Desktop */}
      <ol className="hidden items-center gap-1 sm:flex">
        {steps.map((step, stepIndex) => {
          const isDone = stepIndex < index;
          const isCurrent = stepIndex === index;
          return (
            <li key={step} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(step)}
                disabled={!isDone}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                  isDone && 'text-brand-700 hover:bg-brand-50',
                  isCurrent && 'text-ink-900',
                  !isDone && !isCurrent && 'cursor-default text-ink-400',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem]',
                    isDone && 'bg-brand-600 text-white',
                    isCurrent && 'bg-ink-900 text-white',
                    !isDone && !isCurrent && 'bg-ink-200 text-ink-500',
                  )}
                >
                  {isDone ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                      <path d="M4.6 8.4 2.2 6l-.9.9 3.3 3.3 6-6-.9-.9-5.1 5.1Z" />
                    </svg>
                  ) : (
                    stepIndex + 1
                  )}
                </span>
                {LABELS[step]}
              </button>
              {stepIndex < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn('h-px flex-1', isDone ? 'bg-brand-300' : 'bg-ink-200')}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Shared footer for the step cards. */
export function StepFooter({
  onBack,
  onNext,
  nextLabel = 'Aage barhein',
  nextDisabled,
  loading,
  children,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-ink-200 pt-5 sm:flex-row-reverse sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand-800 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : null}
            {nextLabel}
          </button>
        ) : null}
        {children}
      </div>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          ← Peechay
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Card shell used by every step, so headings and spacing stay consistent. */
export function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-title text-ink-950">{title}</h2>
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
