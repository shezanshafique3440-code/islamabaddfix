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
 * explicitly for the interface not to turn every section into a card.
 */
export function HowItWorks() {
  return (
    <ol className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {STEPS.map((step, index) => (
        <li key={step.number} className="relative">
          {/* Connector, desktop only; drawn behind the numbers. */}
          {index < STEPS.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute left-11 top-4 hidden h-px w-[calc(100%-2rem)] bg-ink-200 lg:block"
            />
          ) : null}
          <div className="relative flex items-baseline gap-3">
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white dark:text-brand-50">
              {step.number}
            </span>
            <h3 className="text-[0.9375rem] font-semibold tracking-tight text-ink-900">
              {step.title}
            </h3>
          </div>
          <p className="mt-2 pl-11 text-sm leading-relaxed text-ink-600">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}
