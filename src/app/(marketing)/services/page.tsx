import type { Metadata } from 'next';
import Link from 'next/link';
import { getCatalogue } from '@/lib/catalogue';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { Badge } from '@/components/ui/Badge';
import { formatPaisaRange } from '@/lib/money';
import { PageHeader } from '@/components/marketing/PageHeader';

export const metadata: Metadata = {
  title: 'Sab services',
  description:
    'Islamabad Fix par available tamam services — AC, electrical, plumbing, cleaning, carpenter, painting, appliances aur security. Verified technicians aur transparent quotes.',
  alternates: { canonical: '/services' },
};

export const revalidate = 600;

export default async function ServicesPage() {
  const catalogue = await getCatalogue();

  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="Hum kya kaam karte hain"
        description="Har service verified technicians karte hain. Qeemat muaina ke baad quote se tay hoti hai — neeche di gayi ranges sirf andaza hain."
      />

      <div className="mx-auto max-w-content px-4 pb-16 sm:px-6">
        <div className="space-y-10">
          {catalogue.map((category) => (
            <section key={category.slug} aria-labelledby={`cat-${category.slug}`}>
              <div className="flex items-start gap-3.5">
                <ServiceIconTile iconKey={category.iconKey} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id={`cat-${category.slug}`} className="text-title text-ink-950">
                      <Link href={`/services/${category.slug}`} className="hover:text-brand-700">
                        {category.name}
                      </Link>
                    </h2>
                    {category.isEmergencyCategory ? (
                      <Badge tone="danger">Emergency available</Badge>
                    ) : null}
                  </div>
                  {category.tagline ? (
                    <p className="mt-0.5 text-sm text-ink-600">{category.tagline}</p>
                  ) : null}
                </div>
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {category.services.map((service) => (
                  <li key={service.slug}>
                    <Link
                      href={`/services/detail/${service.slug}`}
                      className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-card"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-ink-900 group-hover:text-brand-700">
                          {service.name}
                        </span>
                        {service.isEmergencyEnabled ? (
                          <span className="shrink-0 text-xs" title="Emergency booking available">
                            🚨
                          </span>
                        ) : null}
                      </span>
                      {service.description ? (
                        <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">
                          {service.description}
                        </span>
                      ) : null}
                      <span className="mt-auto pt-3 text-sm font-medium text-ink-700">
                        {formatPaisaRange(service.minPricePaisa, service.maxPricePaisa)}
                      </span>
                      <span className="mt-0.5 text-xs text-ink-400">
                        {service.requiresInspection
                          ? 'Muaina ke baad quote'
                          : `Andazan ${service.estimatedMinutes} min`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
