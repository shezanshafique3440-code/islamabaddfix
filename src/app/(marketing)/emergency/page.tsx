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
    'Islamabad mein emergency home services — bara water leakage, electrical fault, generator failure, AC emergency. Available emergency technicians dekhein.',
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
          title="Emergency service is waqt band hai"
          description="Hum emergency dispatch abhi offer nahi kar rahe. Normal booking kar lein ya support se rabta karein."
          breadcrumbs={[{ href: '/', label: 'Home' }]}
        />
        <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
          <SafetyNotice />
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/book">Normal booking karein</ButtonLink>
            <ButtonLink href="/contact" variant="outline">
              Support se rabta karein
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
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-500">
            <Link href="/" className="hover:text-brand-700 hover:underline">
              Home
            </Link>
          </nav>
          <p className="text-eyebrow uppercase text-alert-600">🚨 Emergency</p>
          <h1 className="mt-2 text-display-sm text-ink-950 sm:text-display">
            Foran madad chahiye?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-700 sm:text-base">
            Emergency-available technicians ko aap ki request foran bheji jayegi. Emergency charges
            booking confirm karne se pehle saaf dikhaye jate hain.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <SafetyNotice />

        <section aria-labelledby="emergency-services" className="mt-10">
          <h2 id="emergency-services" className="text-title text-ink-950">
            Kis qism ki emergency hai?
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Service chunein — hum available technicians dikha denge.
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
                          className="hover:border-alert-300 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 transition-all hover:bg-alert-50/50"
                        >
                          <span className="text-sm font-medium text-ink-900">{service.name}</span>
                          <span aria-hidden="true" className="text-ink-400">
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
              title="Abhi koi service emergency ke liye enabled nahi"
              description="Admin panel se services ko emergency ke liye enable kiya jata hai."
              action={{ label: 'Normal booking karein', href: '/book' }}
            />
          )}
        </section>

        <section aria-labelledby="emergency-fee" className="mt-12">
          <h2 id="emergency-fee" className="text-title text-ink-950">
            Emergency charges
          </h2>
          <div className="mt-3 rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-sm leading-relaxed text-ink-700">
              Emergency visit par technician apni emergency fee laagu karta hai, jo normal service
              charge ke ilawa hoti hai. Default{' '}
              <strong className="font-semibold text-ink-900">{formatPaisa(defaultFee)}</strong> hai
              aur platform ki maximum limit{' '}
              <strong className="font-semibold text-ink-900">{formatPaisa(maxFee)}</strong> hai.
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
              Aap ko yeh fee{' '}
              <strong className="font-semibold">booking confirm karne se pehle</strong> dikhayi jati
              hai, aur baqi kaam ka kharcha technician ke muaina ke baad quote mein aata hai — jise
              aap approve ya reject karte hain.
            </p>
          </div>
        </section>

        <section aria-labelledby="emergency-providers" className="mt-12">
          <h2 id="emergency-providers" className="text-title text-ink-950">
            Emergency technicians ({providers.pagination.total})
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Yeh providers emergency calls lete hain. Availability booking ke waqt confirm hoti hai.
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
                      Emergency request bhejein
                    </ButtonLink>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-5"
              title="Is waqt koi emergency technician available nahi"
              description="Aap phir bhi request bhej sakte hain — ops team dekh kar intezam karegi."
              action={{ label: 'Request bhejein', href: '/book?emergency=1' }}
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
    <div className="border-alert-300 rounded-2xl border-2 bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-alert-700">
        <span aria-hidden="true">⚠️</span> Pehle safety
      </h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-800">
        <li>
          <strong className="font-semibold">Aag, gas leak, ya koi zakhmi:</strong> foran{' '}
          <a href="tel:1122" className="font-semibold text-alert-700 underline">
            Rescue 1122
          </a>{' '}
          ko call karein. Technician ka intezar na karein.
        </li>
        <li>
          <strong className="font-semibold">Gas ki bu:</strong> khirkiyan kholein, koi switch ya
          lighter istemal na karein, aur ghar se bahar niklein.
        </li>
        <li>
          <strong className="font-semibold">Sparking ya bijli ka khatra:</strong> us hisse ko na
          chhuein. Agar main breaker mehfooz jagah par hai to usay off kar dein.
        </li>
        <li>
          <strong className="font-semibold">Bara paani leak:</strong> agar mumkin ho to main water
          valve band kar dein aur geele farsh par bijli ke switch na chhuein.
        </li>
      </ul>
      <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
        Khud repair karne ki koshish na karein — bijli, gas aur refrigeration ka kaam qualified
        technician hi kare.
      </p>
    </div>
  );
}
