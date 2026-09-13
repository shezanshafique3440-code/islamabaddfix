import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Wordmark. The mark is a wrench-in-shield: repair plus trust, which is the
 * whole proposition. Drawn inline so it costs nothing to load.
 */
export function Logo({
  className,
  href = '/',
  showTagline = false,
}: {
  className?: string;
  href?: string;
  showTagline?: boolean;
}) {
  return (
    <Link href={href} className={cn('group inline-flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-e1 ring-1 ring-inset ring-white/15 transition-all duration-200 group-hover:shadow-e2 dark:text-brand-50">
        <svg
          viewBox="0 0 24 24"
          className="h-[1.125rem] w-[1.125rem]"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 1.8 4.4 4.7v6.6c0 4.6 3.1 8.4 7.6 9.5 4.5-1.1 7.6-4.9 7.6-9.5V4.7L12 1.8Zm4.1 5.4a3.4 3.4 0 0 1-4.4 4.4l-2.9 2.9a1.2 1.2 0 0 1-1.7-1.7l2.9-2.9a3.4 3.4 0 0 1 4.4-4.4l-1.9 1.9 1.7 1.7 1.9-1.9Z" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-base font-bold tracking-tight text-ink-900">
          Islamabad<span className="text-brand-700">Fix</span>
        </span>
        {showTagline ? (
          <span className="mt-0.5 text-[0.6875rem] font-medium text-ink-500">
            Tell us the problem. We will handle the rest.
          </span>
        ) : null}
      </span>
    </Link>
  );
}
