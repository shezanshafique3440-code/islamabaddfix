const STEPS = [
  {
    number: '1',
    title: 'Tell us the problem',
    description: 'Select a service and describe the issue. A photo helps if you can send one.',
  },
  {
    number: '2',
    title: 'Choose a technician',
    description: 'Compare verified professionals by rating, jobs and rates.',
  },
  {
    number: '3',
    title: 'Book now',
    description: 'Confirm the time, and work begins once you approve the quote.',
  },
  {
    number: '4',
    title: 'Problem solve',
    description: 'The technician arrives, completes the work, then you pay and leave a review.',
  },
];

/**
 * How it works.
 *
 * A connected numbered sequence rather than four cards — the brief asks
 * explicitly for the interface not to turn every section into a card. The
 * connector fades out towards the next step so the eye reads it as a direction
 * of travel rather than four boxes joined by a wire.
 */
export function HowItWorks() {
  return (
    <ol className="relative grid gap-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {STEPS.map((step, index) => (
        <li key={step.number} className="group relative">
          {/* Connector, desktop only; drawn behind the numbers. */}
          {index < STEPS.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute left-12 top-5 hidden h-px w-[calc(100%-2.5rem)] bg-gradient-to-r from-brand-300 to-transparent lg:block"
            />
          ) : null}
          <div className="relative flex items-center gap-3.5">
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 font-display text-sm font-bold text-white shadow-e1 ring-1 ring-inset ring-white/15 dark:text-brand-50">
              {step.number}
            </span>
            <h3 className="text-[0.9375rem] font-semibold tracking-tight text-ink-900">
              {step.title}
            </h3>
          </div>
          <p className="mt-3 pl-[3.375rem] text-sm leading-relaxed text-ink-600">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}
