'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Provider directory filters.
 *
 * State lives in the URL, so a filtered list is shareable and the back button
 * behaves. Each change is a navigation rather than client-side filtering, which
 * keeps the server as the single source of truth about who is visible.
 */
export function ProviderFilters({
  categories,
  zones,
  current,
}: {
  categories: Array<{ slug: string; name: string }>;
  zones: Array<{ slug: string; name: string }>;
  current: {
    categorySlug?: string;
    zoneSlug?: string;
    emergencyOnly: boolean;
    sort: string;
    search?: string;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(current.search ?? '');

  const apply = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      // Any filter change resets to the first page.
      params.delete('page');
      router.push(`/providers?${params.toString()}`);
    },
    [router, searchParams],
  );

  const selectClass =
    'h-10 rounded-xl border border-ink-300 bg-surface px-3 text-sm text-ink-900 hover:border-ink-400 focus:border-brand-600';

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ search: search.trim() || null });
        }}
        className="flex gap-2"
      >
        <label htmlFor="provider-search" className="sr-only">
          Find a technician or service
        </label>
        <input
          id="provider-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or service..."
          className="h-10 flex-1 rounded-xl border border-ink-300 bg-surface px-3.5 text-sm text-ink-900 placeholder:text-ink-500 hover:border-ink-400 focus:border-brand-600"
        />
        <button
          type="submit"
          className="h-10 rounded-xl bg-contrast px-4 text-sm font-semibold text-contrast-fg hover:bg-contrast-hover"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Category"
          value={current.categorySlug ?? ''}
          onChange={(event) => apply({ categorySlug: event.target.value || null })}
          className={selectClass}
        >
          <option value="">Sab categories</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Area"
          value={current.zoneSlug ?? ''}
          onChange={(event) => apply({ zoneSlug: event.target.value || null })}
          className={selectClass}
        >
          <option value="">Sab areas</option>
          {zones.map((zone) => (
            <option key={zone.slug} value={zone.slug}>
              {zone.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort"
          value={current.sort}
          onChange={(event) => apply({ sort: event.target.value })}
          className={selectClass}
        >
          <option value="rating">Best rating</option>
          <option value="jobs">Most jobs</option>
          <option value="experience">Most experience</option>
          <option value="newest">Newest providers</option>
        </select>

        <button
          type="button"
          onClick={() => apply({ emergencyOnly: current.emergencyOnly ? null : '1' })}
          aria-pressed={current.emergencyOnly}
          className={cn(
            'h-10 rounded-xl border px-3.5 text-sm font-medium transition-colors',
            current.emergencyOnly
              ? 'border-alert-300 bg-alert-50 text-alert-700'
              : 'border-ink-300 bg-surface text-ink-700 hover:bg-ink-50',
          )}
        >
          🚨 Emergency only
        </button>

        {current.categorySlug || current.zoneSlug || current.emergencyOnly || current.search ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              router.push('/providers');
            }}
            className="h-10 px-2 text-sm font-medium text-ink-500 hover:text-ink-800 hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
