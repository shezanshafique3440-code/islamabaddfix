import { cn } from '@/lib/utils';

/**
 * Category icons, resolved from the `iconKey` column.
 *
 * Inline SVG paths rather than an icon package: eight icons do not justify a
 * dependency, and inlining them means no extra request on a slow connection.
 * An unknown key falls back to the wrench rather than rendering nothing.
 */
const PATHS: Record<string, string> = {
  snowflake:
    'M12 2v20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2.6 7l17.3 10M2.6 7l4.1.4M2.6 7l1.5-3.9M19.9 17l-4.1-.4M19.9 17l-1.5 3.9M21.4 7L4.1 17M21.4 7l-4.1.4M21.4 7l-1.5-3.9M4.1 17l4.1-.4M4.1 17l1.5 3.9',
  bolt: 'M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z',
  droplet: 'M12 2.7s6.5 6.4 6.5 11a6.5 6.5 0 1 1-13 0c0-4.6 6.5-11 6.5-11Z',
  sparkles:
    'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15ZM19 13l.8 1.8 1.8.7-1.8.8-.8 1.7-.8-1.7-1.8-.8 1.8-.7.8-1.8Z',
  hammer:
    'M14.1 3.5 12 5.6l1.4 1.4-6.6 6.6-1.4-1.4-2.1 2.1 6.4 6.4 2.1-2.1-1.4-1.4 6.6-6.6 1.4 1.4 2.1-2.1-6.4-6.4Z',
  brush:
    'M18.4 2.6a2 2 0 0 1 2.8 2.8l-8.3 8.3-3.6.8.8-3.6 8.3-8.3ZM7 14c-2.2 0-4 1.8-4 4 0 1-.4 1.7-1 2.2 1 .5 2 .8 3 .8 2.8 0 5-2.2 5-5 0-1.1-.9-2-2-2H7Z',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8ZM12 17v5',
  shield:
    'M12 2.5 4 5.6v6c0 4.8 3.3 8.7 8 9.9 4.7-1.2 8-5.1 8-9.9v-6l-8-3.1Zm3.4 7.2-4.2 4.6-2.6-2.4 1-1.1 1.5 1.4 3.2-3.5 1.1 1Z',
  wrench:
    'M20.4 5.5a5.5 5.5 0 0 1-7.2 7.2l-7.6 7.6a2 2 0 0 1-2.8-2.8l7.6-7.6a5.5 5.5 0 0 1 7.2-7.2l-3.1 3.1 2.8 2.8 3.1-3.1Z',
};

/** Filled icons look heavy at small sizes; these are stroked outlines. */
const STROKED = new Set(['snowflake', 'droplet', 'plug']);

export function ServiceIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const path = PATHS[iconKey] ?? PATHS.wrench!;
  const stroked = STROKED.has(iconKey);
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-5 w-5', className)}
      fill={stroked ? 'none' : 'currentColor'}
      stroke={stroked ? 'currentColor' : undefined}
      strokeWidth={stroked ? 1.6 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/** Category icon in its tinted container, as used on cards and chips. */
export function ServiceIconTile({
  iconKey,
  className,
  size = 'md',
}: {
  iconKey: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' }[size];
  const icon = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' }[size];
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700',
        box,
        className,
      )}
    >
      <ServiceIcon iconKey={iconKey} className={icon} />
    </span>
  );
}
