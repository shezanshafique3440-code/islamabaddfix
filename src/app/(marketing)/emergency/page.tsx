import type { Metadata } from 'next';
import Link from 'next/link';
import { getEmergencyServices } from '@/lib/catalogue';
import { listPublicProviders } from '@/lib/providers/visibility';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ProviderCard } from '@/components/marketing/ProviderCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { formatPaisa } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Emergency service — Islamabad',
  description:
    'Emergency home services in Islamabad — major water leaks, electrical faults, generator failure, AC emergencies. See the emergency technicians available now.',
  alternates: { canonical: '/emergency' },
};

export const revalidate = 120;

export default async function EmergencyPage() {
  const [enabled, services, providers, defaultFee, maxFee] = await Promise.all([
    getSetting('emergency.enabled'),
    getEmergencyServices(),
    listPublicProviders({ emergencyOnly: true, perPage: 12 }),
    getSetting('emergency.defaultFeePaisa'),
    getSetting('emergency.maxFeePaisa'),
  ]);

  if (!enabled) {
    return (
      <>
        <PageHeader
          eyebrow="Emergency"
          title="Emergency service is currently switched off"
          description="We are not offering emergency dispatch right now. Make a normal booking or contact support."
          breadcrumbs={[{ href: '/', label: 'Home' }]}
        />
        <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
          <SafetyNotice />
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/book">Make a normal booking</ButtonLink>
            <ButtonLink href="/contact" variant="outline">
              Contact support
            </ButtonLink>
          </div>
        </div>
      </>
    );
  }

  // Group emergency-enabled services by category for the picker.
  const grouped = services.reduce<
    Map<string, { name: string; iconKey: string; services: typeof services }>
  >((map, service) => {
    const existing = map.get(service.category.slug);
    if (existing) existing.services.push(service);
    else
      map.set(service.category.slug, {
        name: service.category.name,
        iconKey: service.category.iconKey,
        services: [service],
      });
    return map;
  }, new Map());

  return (
    <>
      <div className="border-b border-alert-200 bg-alert-50">
        <div className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-12">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-600">
            <Link href="/" className="hover:text-brand-700 hover:underline">
              Home
            </Link>
          </nav>
          <p className="text-eyebrow uppercase text-alert-700">🚨 Emergency</p>
          <h1 className="mt-2 text-display-sm text-ink-950 sm:text-display">
            Need help right now?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-700 sm:text-base">
            Your request goes out immediately to technicians available for emergencies. Emergency
            charges are shown clearly before you confirm the booking.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <SafetyNotice />

        <section aria-labelledby="emergency-services" className="mt-10">
          <h2 id="emergency-services" className="text-title text-ink-950">
            What kind of emergency is it?
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Pick a service — we will show you the technicians available.
          </p>

          {grouped.size > 0 ? (
            <div className="mt-5 space-y-6">
              {[...grouped.entries()].map(([slug, group]) => (
                <div key={slug}>
                  <div className="flex items-center gap-2.5">
                    <ServiceIconTile iconKey={group.iconKey} size="sm" />
                    <h3 className="text-sm font-semibold text-ink-900">{group.name}</h3>
                  </div>
                  <ul className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.services.map((service) => (
                      <li key={service.id}>
                        <Link
                          href={`/book?service=${service.slug}&emergency=1`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-surface px-4 py-3 transition-all hover:border-alert-300 hover:bg-alert-50/50"
                        >
                          <span className="text-sm font-medium text-ink-900">{service.name}</span>
                          <span aria-hidden="true" className="text-ink-500">
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-5"
              title="No service is enabled for emergency yet"
              description="Services are enabled for emergency from the admin panel."
              action={{ label: 'Make a normal booking', href: '/book' }}
            />
          )}
        </section>

        <section aria-labelledby="emergency-fee" className="mt-12">
          <h2 id="emergency-fee" className="text-title text-ink-950">
            Emergency charges
          </h2>
          <div className="mt-3 rounded-2xl border border-ink-200 bg-surface p-5">
            <p className="text-sm leading-relaxed text-ink-700">
              On an emergency visit the technician applies their emergency fee, which is charged on
              top of the normal service charge. The default is{' '}
              <strong className="font-semibold text-ink-900">{formatPaisa(defaultFee)}</strong> and
              the platform maximum is{' '}
              <strong className="font-semibold text-ink-900">{formatPaisa(maxFee)}</strong>.
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
              You are shown this fee{' '}
              <strong className="font-semibold">before you confirm the booking</strong>, and the
              cost of the rest of the work comes in the technician’s quote after inspection — which
              you approve or reject.
            </p>
          </div>
        </section>

        <section aria-labelledby="emergency-providers" className="mt-12">
          <h2 id="emergency-providers" className="text-title text-ink-950">
            Emergency technicians ({providers.pagination.total})
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            These providers take emergency calls. Availability is confirmed at the time of booking.
          </p>

          {providers.items.length > 0 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {providers.items.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  action={
                    <ButtonLink
                      href={`/book?provider=${provider.slug}&emergency=1`}
                      variant="danger"
                      size="sm"
                      fullWidth
                    >
                      Send emergency request
                    </ButtonLink>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-5"
              title="No emergency technician is available right now"
              description="You can still send the request — the operations team will arrange someone."
              action={{ label: 'Send request', href: '/book?emergency=1' }}
            />
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Safety guidance shown on every state of this page.
 *
 * Deliberately tells people to contact emergency services first for fire, gas
 * and injury, and to switch off at the main only if it is safe to reach — no
 * repair instruction of any kind.
 */
function SafetyNotice() {
  return (
    <div className="rounded-2xl border-2 border-alert-300 bg-surface p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-alert-700">
        <span aria-hidden="true">⚠️</span> Safety first
      </h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-800">
        <li>
          <strong className="font-semibold">Fire, a gas leak, or anyone injured:</strong> call{' '}
          <a href="tel:1122" className="font-semibold text-alert-700 underline">
            Rescue 1122
          </a>{' '}
          immediately. Do not wait for a technician.
        </li>
        <li>
          <strong className="font-semibold">Smell of gas:</strong> open the windows, do not touch
          any switch or lighter, and get out of the building.
        </li>
        <li>
          <strong className="font-semibold">Sparking or an electrical hazard:</strong> do not touch
          that part. If the main breaker is somewhere safe to reach, switch it off.
        </li>
        <li>
          <strong className="font-semibold">Major water leak:</strong> if you can, shut the main
          water valve, and do not touch electrical switches on a wet floor.
        </li>
      </ul>
      <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
        Do not attempt the repair yourself — electrical, gas and refrigeration work belongs to a
        qualified technician.
      </p>
    </div>
  );
}
