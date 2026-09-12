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
          className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3.5 transition-all duration-150 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-card"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
            <ServiceIcon iconKey={category.iconKey} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900">
              {category.name}
            </span>
            {category.serviceCount !== undefined ? (
              <span className="block text-xs text-ink-500">{category.serviceCount} services</span>
            ) : null}
          </span>
        </Link>
      ))}

      {showMore ? (
        <Link
          href="/services"
          className="group flex items-center gap-3 rounded-xl border border-dashed border-ink-300 bg-white p-3.5 transition-colors hover:border-brand-400 hover:bg-brand-50/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
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
