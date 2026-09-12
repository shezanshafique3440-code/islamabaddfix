import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { getProviderOffers, listBookingsFor, summarizeBooking } from '@/lib/bookings/queries';
import { BookingList } from '@/components/account/BookingList';
import { JobOfferList } from '@/components/provider/JobOfferList';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Meri jobs', robots: { index: false, follow: false } };

const TABS = [
  { key: 'offers', label: 'Nayi requests' },
  { key: 'active', label: 'Chal rahi hain' },
  { key: 'completed', label: 'Mukammal' },
  { key: 'all', label: 'Sab' },
] as const;

export default async function ProviderJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/jobs');
  if (!ctx.providerId) redirect('/provider/onboarding');

  const query = await searchParams;
  const view = (TABS.find((tab) => tab.key === query.view)?.key ?? 'active') as
    'offers' | 'active' | 'completed' | 'all';
  const page = Number(query.page ?? 1) || 1;

  const offers = view === 'offers' ? await getProviderOffers(ctx.providerId) : [];
  const list =
    view === 'offers'
      ? null
      : await listBookingsFor(ctx, {
          page,
          perPage: 10,
          scope: view === 'completed' ? 'completed' : view === 'active' ? 'active' : 'all',
        });

  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Meri jobs</h1>

      <nav aria-label="Job filters" className="no-scrollbar -mx-1 mt-5 overflow-x-auto px-1">
        <div className="flex gap-1.5">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/provider/jobs?view=${tab.key}`}
              aria-current={view === tab.key ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                view === tab.key
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
        {view === 'offers' ? (
          offers.length > 0 ? (
            <JobOfferList offers={offers} />
          ) : (
            <EmptyState
              title="Koi nayi request nahi"
              description="Nayi request aane par aap ko notification milega. Jitni jaldi jawab denge, utni behtar ranking."
            />
          )
        ) : list && list.items.length > 0 ? (
          <BookingList
            bookings={list.items.map(summarizeBooking)}
            pagination={list.pagination}
            basePath={`/provider/jobs?view=${view}`}
            hrefPrefix="/provider/jobs"
          />
        ) : (
          <EmptyState
            title={view === 'completed' ? 'Abhi koi job mukammal nahi' : 'Koi job chal nahi rahi'}
            description="Nayi requests 'Nayi requests' tab mein dikhengi."
          />
        )}
      </div>
    </div>
  );
}
