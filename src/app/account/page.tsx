import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { listBookingsFor, summarizeBooking } from '@/lib/bookings/queries';
import { BookingList } from '@/components/account/BookingList';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Meri bookings',
  robots: { index: false, follow: false },
};

const TABS = [
  { key: 'active', label: 'Chal rahi hain' },
  { key: 'upcoming', label: 'Aane wali' },
  { key: 'completed', label: 'Mukammal' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'disputed', label: 'Disputes' },
  { key: 'all', label: 'Sab' },
] as const;

type Scope = (typeof TABS)[number]['key'];

export default async function AccountBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; page?: string }>;
}) {
  const ctx = await requirePageRole(['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'], '/account');
  const query = await searchParams;
  const scope = (TABS.find((tab) => tab.key === query.scope)?.key ?? 'active') as Scope;
  const page = Number(query.page ?? 1) || 1;

  const result = await listBookingsFor(ctx, { page, perPage: 10, scope });
  const bookings = result.items.map(summarizeBooking);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Meri bookings</h1>
          <p className="mt-1 text-sm text-ink-600">
            Status, quotes aur payments — sab yahan.
          </p>
        </div>
        <Link
          href="/book"
          className="hidden h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 sm:inline-flex md:hidden"
        >
          + Nayi booking
        </Link>
      </div>

      <nav aria-label="Booking filters" className="mt-5 -mx-1 overflow-x-auto px-1 no-scrollbar">
        <div className="flex gap-1.5">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/account?scope=${tab.key}`}
              aria-current={scope === tab.key ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                scope === tab.key
                  ? 'bg-ink-900 text-white'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mt-5">
        {bookings.length > 0 ? (
          <BookingList bookings={bookings} pagination={result.pagination} basePath={`/account?scope=${scope}`} />
        ) : (
          <EmptyState
            title={
              scope === 'active'
                ? 'Koi booking chal nahi rahi'
                : scope === 'completed'
                  ? 'Abhi koi mukammal booking nahi'
                  : 'Is filter mein kuch nahi'
            }
            description="Nayi booking banayein — masla batayein aur verified technician chunein."
            action={{ label: 'Service book karein', href: '/book' }}
          />
        )}
      </div>
    </div>
  );
}
