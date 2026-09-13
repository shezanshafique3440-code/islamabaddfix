'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Hero problem input.
 *
 * Does not call the assistant itself — it hands the text to /book, where the
 * intake step runs it through the API. Keeping the network call out of the hero
 * means the landing page stays fast and works before JavaScript hydrates.
 */
const EXAMPLES = [
  'The AC runs but blows no cold air',
  'There is a leak in the bathroom',
  'I need an electrician, two switches are not working',
  'I need a deep clean of the house',
];

export function ProblemSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (text: string) => {
    const problem = text.trim();
    if (problem.length < 3) return;
    setSubmitting(true);
    router.push(`/book?problem=${encodeURIComponent(problem)}`);
  };

  return (
    <div className={cn('w-full', className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="flex flex-col gap-2.5 sm:flex-row"
      >
        <div className="relative flex-1">
          <label htmlFor="problem-search" className="sr-only">
            What do you need help with?
          </label>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" strokeLinecap="round" />
          </svg>
          <input
            id="problem-search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="The AC is not working..."
            autoComplete="off"
            className="h-14 w-full rounded-xl border border-ink-300 bg-surface pl-12 pr-4 text-[0.9375rem] text-ink-900 shadow-e1 transition-shadow placeholder:text-ink-500 hover:border-ink-400 focus:border-brand-600 focus:shadow-glow"
          />
        </div>
        <Button type="submit" size="lg" loading={submitting} className="h-14 shadow-e2 sm:px-7">
          Find a service
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-500">For example:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setValue(example);
              submit(example);
            }}
            className="rounded-full border border-ink-200 bg-surface px-3 py-1.5 text-xs text-ink-600 transition-all duration-150 hover:-translate-y-px hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 hover:shadow-e1"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
