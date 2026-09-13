import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategoryBySlug } from '@/lib/catalogue';
import { listPublicProviders } from '@/lib/providers/visibility';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ProviderCard } from '@/components/marketing/ProviderCard';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisaRange } from '@/lib/money';
import { env } from '@/lib/env';
import { jsonLdScript } from '@/lib/seo';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 600;

/** Pre-render the category pages: they are the main SEO surface. */
export async function generateStaticParams() {
  const categories = await prisma.serviceCategory.findMany({
    where: { isActive: true, deletedAt: null },
    select: { slug: true },
  });
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Service not found' };

  const title = `${category.name} Islamabad — verified technicians`;
  const description =
    category.description ??
    `${category.name} services in Islamabad. Verified technicians, transparent quotes aur asaan booking.`;

  return {
    title,
    description,
    alternates: { canonical: `/services/${category.slug}` },
    openGraph: {
      title,
      description,
      url: `${env.NEXT_PUBLIC_APP_URL}/services/${category.slug}`,
      type: 'website',
    },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const providers = await listPublicProviders({ categorySlug: slug, perPage: 6 });

  /*
   * Structured data. Described as a Service offered by an Organization, which
   * is what this actually is — deliberately no aggregateRating or review markup
   * unless the numbers behind it are real and on the page.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: category.name,
    description: category.description ?? category.tagline ?? undefined,
    serviceType: category.name,
    areaServed: { '@type': 'City', name: 'Islamabad', addressCountry: 'PK' },
    provider: {
      '@type': 'Organization',
      name: 'Islamabad Fix',
      url: env.NEXT_PUBLIC_APP_URL,
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${category.name} services`,
      itemListElement: category.services.map((service) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: service.name },
        priceSpecification: {
          '@type': 'PriceSpecification',
          priceCurrency: 'PKR',
          minPrice: service.minPricePaisa / 100,
          ...(service.maxPricePaisa ? { maxPrice: service.maxPricePaisa / 100 } : {}),
        },
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Server-generated from our own database; no user input reaches it.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <PageHeader
        eyebrow={category.isEmergencyCategory ? 'Emergency available' : 'Service category'}
        title={category.name}
        description={category.description ?? category.tagline ?? undefined}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/services', label: 'Services' },
        ]}
        action={<ButtonLink href={`/book?category=${category.slug}`}>Book Now</ButtonLink>}
      />

      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <section aria-labelledby="services-heading">
          <h2 id="services-heading" className="text-title text-ink-950">
            {category.name} services
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {category.services.map((service) => (
              <li key={service.id}>
                <div className="flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink-900">{service.name}</h3>
                    {service.isEmergencyEnabled ? <Badge tone="danger">Emergency</Badge> : null}
                  </div>
                  {service.description ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">
                      {service.description}
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium text-ink-800">
                    {formatPaisaRange(service.minPricePaisa, service.maxPricePaisa)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {service.requiresInspection
                      ? 'Final price after inspection'
                      : `Andazan ${service.estimatedMinutes} minute`}
                  </p>
                  <ButtonLink
                    href={`/book?service=${service.slug}`}
                    variant="outline"
                    size="sm"
                    className="mt-4"
                  >
                    Book now
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="providers-heading" className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="providers-heading" className="text-title text-ink-950">
                {category.name} technicians
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Verified professionals who offer these services.
              </p>
            </div>
            <Link
              href={`/providers?categorySlug=${category.slug}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              View all →
            </Link>
          </div>

          {providers.items.length > 0 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {providers.items.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  action={
                    <ButtonLink
                      href={`/book?category=${category.slug}&provider=${provider.slug}`}
                      variant="outline"
                      size="sm"
                      fullWidth
                    >
                      Book this technician
                    </ButtonLink>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-5"
              title="No verified technician in this category yet"
              description="We are still adding providers in this area. You can still send a request — the ops team will assign a technician manually."
              action={{ label: 'Send request', href: `/book?category=${category.slug}` }}
            />
          )}
        </section>
      </div>
    </>
  );
}
