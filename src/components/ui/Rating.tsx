import { cn } from '@/lib/utils';

/**
 * Star rating display. Renders the numeric value as text too, because a row of
 * stars alone is unreadable to a screen reader and imprecise to everyone else.
 */
export function Rating({
  value,
  count,
  size = 'md',
  className,
  showEmpty = true,
}: {
  value: number | null;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** What to show when the provider has no reviews yet. */
  showEmpty?: boolean;
}) {
  const dimensions = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' }[size];
  const text = { sm: 'text-xs', md: 'text-sm', lg: 'text-[0.9375rem]' }[size];

  if (value === null || value === 0) {
    if (!showEmpty) return null;
    return (
      <span className={cn('text-ink-500', text, className)}>Abhi koi rating nahi</span>
    );
  }

  const rounded = Math.round(value * 10) / 10;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-label={`${rounded} out of 5${count !== undefined ? `, ${count} reviews` : ''}`}
    >
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            viewBox="0 0 20 20"
            className={cn(dimensions, star <= Math.round(value) ? 'text-warn-500' : 'text-ink-200')}
            fill="currentColor"
          >
            <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
          </svg>
        ))}
      </span>
      <span className={cn('font-semibold text-ink-900', text)}>{rounded.toFixed(1)}</span>
      {count !== undefined ? (
        <span className={cn('text-ink-500', text)}>({count})</span>
      ) : null}
    </span>
  );
}

/** Interactive star picker for the review form. */
export function RatingInput({
  value,
  onChange,
  name,
  label,
  size = 'lg',
}: {
  value: number;
  onChange: (value: number) => void;
  name: string;
  label: string;
  size?: 'md' | 'lg';
}) {
  const dimensions = { md: 'h-6 w-6', lg: 'h-8 w-8' }[size];
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">{label}</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="cursor-pointer p-0.5"
            // The radio itself stays in the DOM for keyboard and form semantics.
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <svg
              viewBox="0 0 20 20"
              className={cn(
                dimensions,
                'transition-colors',
                star <= value ? 'text-warn-500' : 'text-ink-200 hover:text-warn-200',
              )}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
            </svg>
            <span className="sr-only">{star} star</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
