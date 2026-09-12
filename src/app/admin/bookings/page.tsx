import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { listBookingsFor, summarizeBooking } from '@/lib/bookings/queries';
import { BookingList } from '@/components/account/BookingList';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Bookings', robots: { index: false, follow: false } };

const TABS = [
  { key: 'all', label: 'Sab' },
  { key: 'active', label: 'Chal rahi hain' },
  { key: 'completed', label: 'Mukammal' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; status?: string; search?: string; page?: string }>;
}) {
  const ctx = await requirePermission('booking:read:any');
  const query = await searchParams;
  const scope = (TABS.find((tab) => tab.key === query.scope)?.key ?? 'all') as
    'all' | 'active' | 'completed' | 'disputed' | 'cancelled';

  const result = await listBookingsFor(ctx, {
    page: Number(query.page ?? 1) || 1,
    perPage: 20,
    scope,
    status: query.status ? [query.status] : undefined,
    search: query.search,
  });

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Bookings</h1>
          <p className="mt-1 text-sm text-ink-600">{result.pagination.total} bookings</p>
        </div>
        <form className="flex gap-2" action="/admin/bookings">
          <input type="hidden" name="scope" value={scope} />
          <input
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Reference, customer ya service"
            aria-label="Bookings dhoondein"
            className="h-10 w-56 rounded-xl border border-ink-300 px-3.5 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Dhoondein
          </button>
        </form>
      </header>

      <nav aria-label="Booking filters" className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/bookings?scope=${tab.key}`}
            aria-current={scope === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              scope === tab.key
                ? 'bg-ink-900 text-white'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )}
          >
            {tab.label}
          </Link>
        ))}
        {query.status ? (
          <Link
            href="/admin/bookings"
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:underline"
          >
            Status filter clear karein ({query.status})
          </Link>
        ) : null}
      </nav>

      <div className="mt-5">
        {result.items.length > 0 ? (
          <BookingList
            bookings={result.items.map(summarizeBooking)}
            pagination={result.pagination}
            basePath={`/admin/bookings?scope=${scope}`}
            hrefPrefix="/account/bookings"
          />
        ) : (
          <EmptyState
            title="Is filter par koi booking nahi"
            description="Doosra filter chunein ya search clear karein."
          />
        )}
      </div>
    </div>
  );
}
