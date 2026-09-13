import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Shared page header for the marketing surface, with optional breadcrumbs.
 *
 * Carries a quieter version of the home page's hero treatment — one brand wash
 * and the same grain — so an inner page reads as the same product rather than as
 * a plain document that happens to share a nav bar.
 */
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
    <div
      className={cn(
        'relative isolate overflow-hidden border-b border-ink-200 bg-surface-sunken',
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-[6%] -top-[60%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgb(var(--c-brand-400)/calc(0.18*var(--wash-strength)))_0%,transparent_70%)] blur-2xl" />
        <div className="grain absolute inset-0" />
      </div>
      <div className="mx-auto max-w-content px-4 py-12 sm:px-6 sm:py-14">
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
            {eyebrow ? (
              <p className="flex items-center gap-2.5 text-eyebrow uppercase text-brand-700">
                <span aria-hidden="true" className="h-px w-6 bg-brand-400" />
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-2.5 text-display-sm text-ink-950 sm:text-display">{title}</h1>
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
