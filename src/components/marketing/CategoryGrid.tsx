import Link from 'next/link';
import { ServiceIcon } from '@/components/ui/ServiceIcon';
import { cn } from '@/lib/utils';

interface CategoryTile {
  name: string;
  slug: string;
  iconKey: string;
  serviceCount?: number;
}

/**
 * Popular categories. On mobile this is a two-column grid rather than a
 * horizontal scroller: everything stays visible without swiping, which matters
 * when this is the main way into the product.
 *
 * Each tile lifts by two pixels on hover and its icon tile fills with brand.
 * That is the whole interaction — the restraint is deliberate, because twelve
 * tiles all pulsing at once is noise, not polish.
 */
export function CategoryGrid({
  categories,
  className,
  showMore = true,
}: {
  categories: CategoryTile[];
  className?: string;
  showMore?: boolean;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={`/services/${category.slug}`}
          className="group relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-ink-200 bg-surface p-4 transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2"
        >
          {/* Brand wash from the icon corner, on hover only. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_100%_at_0%_50%,rgb(var(--c-brand-400)/0.16)_0%,transparent_100%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200 transition-all duration-200 group-hover:from-brand-600 group-hover:to-brand-700 group-hover:text-white group-hover:ring-brand-600 dark:group-hover:text-brand-50">
            <ServiceIcon iconKey={category.iconKey} className="h-5 w-5" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-800">
              {category.name}
            </span>
            {category.serviceCount !== undefined ? (
              <span className="block text-xs text-ink-500">{category.serviceCount} services</span>
            ) : null}
          </span>
          <svg
            viewBox="0 0 20 20"
            className="relative h-4 w-4 shrink-0 -translate-x-1 text-ink-300 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-brand-600 group-hover:opacity-100"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 10h11M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ))}

      {showMore ? (
        <Link
          href="/services"
          className="group flex items-center gap-3.5 rounded-2xl border border-dashed border-ink-300 bg-surface p-4 transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50/40"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-ink-900">More</span>
        </Link>
      ) : null}
    </div>
  );
}
