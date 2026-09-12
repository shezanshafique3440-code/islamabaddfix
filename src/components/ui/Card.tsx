import { cn } from '@/lib/utils';

/**
 * Card is used sparingly. Section 59 of the brief is explicit that not every
 * block should look like a card, so the default is a quiet bordered surface and
 * `interactive` is opt-in for things that are genuinely clickable.
 */
export function Card({
  className,
  interactive,
  children,
  as: Component = 'div',
}: {
  className?: string;
  interactive?: boolean;
  children: React.ReactNode;
  as?: 'div' | 'article' | 'section' | 'li';
}) {
  return (
    <Component
      className={cn(
        'rounded-2xl border border-ink-200 bg-white',
        interactive && 'transition-shadow duration-150 hover:shadow-lift',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pb-3 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[0.9375rem] font-semibold tracking-tight text-ink-900">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('border-t border-ink-200 bg-ink-50/60 px-5 py-3', className)}>
      {children}
    </div>
  );
}
