import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServiceBySlug } from '@/lib/catalogue';
import { listPublicProviders } from '@/lib/providers/visibility';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ProviderCard } from '@/components/marketing/ProviderCard';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisaRange } from '@/lib/money';
import { env } from '@/lib/env';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: 'Service not found' };

  const title = `${service.name} in Islamabad`;
  const description =
    service.description ??
    `${service.name} in Islamabad — verified technicians, and a clear quote after the inspection.`;

  return {
    title,
    description,
    alternates: { canonical: `/services/detail/${service.slug}` },
    openGraph: {
      title,
      description,
      url: `${env.NEXT_PUBLIC_APP_URL}/services/detail/${service.slug}`,
    },
  };
}

export default async function ServiceDetailPage({ params }: Params) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) notFound();

  const [providers, guaranteeDays, guaranteeEnabled] = await Promise.all([
    listPublicProviders({ serviceSlug: slug, perPage: 8 }),
    getSetting('guarantee.days'),
    getSetting('guarantee.enabled'),
  ]);

  const guaranteeApplies = guaranteeEnabled && service.guaranteeEligible;

  return (
    <>
      <PageHeader
        eyebrow={service.category.name}
        title={service.name}
        description={service.description ?? undefined}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/services', label: 'Services' },
          { href: `/services/${service.category.slug}`, label: service.category.name },
        ]}
        action={<ButtonLink href={`/book?service=${service.slug}`}>Book Now</ButtonLink>}
      />

      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-title text-ink-950">
              {service.name} — {providers.pagination.total} verified technician
              {providers.pagination.total === 1 ? '' : 's'}
            </h2>
            {providers.items.length > 0 ? (
              <div className="mt-5 space-y-4">
                {providers.items.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    action={
                      <ButtonLink
                        href={`/book?service=${service.slug}&provider=${provider.slug}`}
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
                title="No verified technician is listed yet"
                description="You can send the request — the operations team will assign a technician."
                action={{ label: 'Send request', href: `/book?service=${service.slug}` }}
              />
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-ink-200 bg-white p-5">
              <h2 className="text-eyebrow uppercase text-ink-500">Indicative price</h2>
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink-950">
                {formatPaisaRange(service.minPricePaisa, service.maxPricePaisa)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                This is an estimate only. The final price is set by the technician’s inspection and
                written quote, which you can approve or reject.
              </p>

              <dl className="mt-4 space-y-2.5 border-t border-ink-100 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Estimated time</dt>
                  <dd className="font-medium text-ink-900">{service.estimatedMinutes} min</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Inspection required</dt>
                  <dd className="font-medium text-ink-900">
                    {service.requiresInspection ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Emergency</dt>
                  <dd className="font-medium text-ink-900">
                    {service.isEmergencyEnabled ? 'Available' : 'No'}
                  </dd>
                </div>
              </dl>

              <ButtonLink href={`/book?service=${service.slug}`} fullWidth className="mt-5">
                Book Now
              </ButtonLink>
            </div>

            {guaranteeApplies ? (
              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true">🛡️</span>
                  <h2 className="text-sm font-semibold text-brand-900">
                    {service.guaranteeDaysOverride ?? guaranteeDays}-day Fix Guarantee
                  </h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-brand-900/80">
                  If the same problem returns within the guarantee period, you can request a
                  re-visit. Every claim is reviewed by the ops team.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-ink-200 bg-ink-50 p-5">
                <h2 className="text-sm font-semibold text-ink-800">Guarantee</h2>
                <p className="mt-2 text-xs leading-relaxed text-ink-600">
                  The re-visit guarantee does not apply to this service. If you are not satisfied
                  with the work, you can open a dispute on the booking.
                </p>
              </div>
            )}

            {service.isEmergencyEnabled ? (
              <div className="rounded-2xl border border-alert-200 bg-alert-50 p-5">
                <Badge tone="danger">Emergency</Badge>
                <p className="mt-2 text-xs leading-relaxed text-ink-700">
                  Emergency booking is available for this service. Emergency charges are shown
                  clearly before you confirm.
                </p>
                <ButtonLink
                  href={`/emergency?service=${service.slug}`}
                  variant="danger"
                  size="sm"
                  fullWidth
                  className="mt-3"
                >
                  Emergency booking
                </ButtonLink>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
