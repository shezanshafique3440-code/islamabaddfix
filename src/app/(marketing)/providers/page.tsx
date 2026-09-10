import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicProviders } from '@/lib/providers/visibility';
import { getCatalogue, listZones } from '@/lib/catalogue';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ProviderCard } from '@/components/marketing/ProviderCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProviderFilters } from '@/components/marketing/ProviderFilters';

export const metadata: Metadata = {
  title: 'Verified technicians in Islamabad',
  description:
    'Islamabad Fix ke verified service providers — rating, mukammal jobs, tajurba aur service areas dekh kar apna technician chunein.',
  alternates: { canonical: '/providers' },
};

interface SearchParams {
  categorySlug?: string;
  zoneSlug?: string;
  emergencyOnly?: string;
  sort?: string;
  page?: string;
  search?: string;
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const page = Number(query.page ?? 1) || 1;

  const [result, catalogue, zones] = await Promise.all([
    listPublicProviders({
      categorySlug: query.categorySlug,
      zoneSlug: query.zoneSlug,
      emergencyOnly: query.emergencyOnly === '1',
      search: query.search,
      sort: (query.sort as 'rating' | 'jobs' | 'experience' | 'newest' | undefined) ?? 'rating',
      page,
      perPage: 12,
    }),
    getCatalogue(),
    listZones({ activeOnly: true }),
  ]);

  const { pagination } = result;

  return (
    <>
      <PageHeader
        eyebrow="Technicians"
        title="Verified professionals"
        description="Sirf woh providers dikhte hain jinki shanakht aur onboarding maloomat humari team ne check ki hain."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <ProviderFilters
          categories={catalogue.map((c) => ({ slug: c.slug, name: c.name }))}
          zones={zones.map((z) => ({ slug: z.slug, name: z.name }))}
          current={{
            categorySlug: query.categorySlug,
            zoneSlug: query.zoneSlug,
            emergencyOnly: query.emergencyOnly === '1',
            sort: query.sort ?? 'rating',
            search: query.search,
          }}
        />

        <p className="mt-6 text-sm text-ink-500" aria-live="polite">
          {pagination.total} technician{pagination.total === 1 ? '' : 's'} mile
        </p>

        {result.items.length > 0 ? (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {result.items.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  action={
                    <ButtonLink
                      href={`/providers/${provider.slug}`}
                      variant="outline"
                      size="sm"
                      fullWidth
                    >
                      Profile dekhein
                    </ButtonLink>
                  }
                />
              ))}
            </div>

            {pagination.totalPages > 1 ? (
              <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
                {Array.from({ length: pagination.totalPages }).map((_, index) => {
                  const target = index + 1;
                  const params = new URLSearchParams(
                    Object.entries(query).filter(([, value]) => value !== undefined) as [
                      string,
                      string,
                    ][],
                  );
                  params.set('page', String(target));
                  const isCurrent = target === pagination.page;
                  return (
                    <Link
                      key={target}
                      href={`/providers?${params.toString()}`}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={
                        isCurrent
                          ? 'flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white'
                          : 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-ink-200 px-3 text-sm text-ink-700 hover:bg-ink-50'
                      }
                    >
                      {target}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
          </>
        ) : (
          <EmptyState
            className="mt-6"
            title="Is filter par koi technician nahi mila"
            description="Filter badal kar dobara koshish karein, ya seedha booking request bhej dein — ops team technician assign kar degi."
            action={{ label: 'Booking request bhejein', href: '/book' }}
          />
        )}
      </div>
    </>
  );
}
