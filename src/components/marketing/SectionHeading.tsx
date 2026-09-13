import { cn } from '@/lib/utils';

/**
 * The heading that opens a marketing section.
 *
 * The eyebrow carries a short accent rule rather than sitting alone: it gives
 * the eye a fixed left edge to return to down a long page, which is most of what
 * a section label is for.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  const centered = align === 'center';
  return (
    <div className={cn('max-w-2xl', centered && 'mx-auto text-center', className)}>
      <p
        className={cn(
          'flex items-center gap-2.5 text-eyebrow uppercase text-brand-700',
          centered && 'justify-center',
        )}
      >
        <span aria-hidden="true" className="h-px w-6 bg-brand-400" />
        {eyebrow}
      </p>
      <h2 className="mt-3 text-display-sm text-ink-950 sm:text-display">{title}</h2>
      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}
