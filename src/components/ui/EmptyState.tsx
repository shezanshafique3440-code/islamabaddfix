import { cn } from '@/lib/utils';
import { ButtonLink } from './Button';

/**
 * Empty state.
 *
 * Every list in the product uses this rather than showing nothing: an empty
 * screen with no explanation reads as a broken screen.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-surface-sunken px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-ink-500 shadow-e1 ring-1 ring-inset ring-ink-200">
          {icon}
        </div>
      ) : null}
      <p className="text-[0.9375rem] font-semibold text-ink-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      ) : null}
      {action ? (
        <ButtonLink href={action.href} size="sm" className="mt-4">
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

/**
 * Shown where a feature needs an integration that this deployment has not
 * configured. States plainly what is missing instead of failing silently or
 * rendering a control that cannot work.
 */
export function NotConfiguredNotice({
  feature,
  detail,
  className,
}: {
  feature: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3',
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        className="mt-0.5 h-4 w-4 shrink-0 text-warn-600"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.5 2.6a1.7 1.7 0 0 1 3 0l6.1 11.2A1.7 1.7 0 0 1 16.1 16.5H3.9a1.7 1.7 0 0 1-1.5-2.7L8.5 2.6ZM11 7H9v4h2V7Zm0 5H9v2h2v-2Z"
          clipRule="evenodd"
        />
      </svg>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-warn-700">{feature} is not configured</p>
        {detail ? <p className="mt-0.5 leading-relaxed text-warn-700/90">{detail}</p> : null}
      </div>
    </div>
  );
}
