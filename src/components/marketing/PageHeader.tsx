import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Shared page header for the marketing surface, with optional breadcrumbs. */
export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: Array<{ href: string; label: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-ink-200 bg-ink-50/60', className)}>
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-12">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
              {breadcrumbs.map((crumb, index) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-ink-300">
                      /
                    </span>
                  ) : null}
                  <Link href={crumb.href} className="hover:text-brand-700 hover:underline">
                    {crumb.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            {eyebrow ? <p className="text-eyebrow uppercase text-brand-700">{eyebrow}</p> : null}
            <h1 className="mt-1.5 text-display-sm text-ink-950 sm:text-display">{title}</h1>
            {description ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
