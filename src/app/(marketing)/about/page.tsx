import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'Islamabad Fix is a marketplace connecting homes and businesses in Islamabad with verified service providers.',
  alternates: { canonical: '/about' },
};

export default async function AboutPage() {
  const city = await getSetting('platform.city');

  return (
    <>
      <PageHeader
        eyebrow="About"
        title="About us"
        description={`Making home and business services in ${city} something you can rely on.`}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="space-y-8 text-[0.9375rem] leading-relaxed text-ink-700">
          <section>
            <h2 className="text-title text-ink-950">The problem</h2>
            <p className="mt-3">
              Finding a good technician in {city} still runs on who you know. You ask around for a
              number, you have no idea what it should cost, and if the work goes wrong nobody is
              accountable. On the other side, hard-working technicians are short of work because
              they have no way to reach new customers.
            </p>
          </section>

          <section>
            <h2 className="text-title text-ink-950">What we do</h2>
            <p className="mt-3">
              Islamabad Fix is a marketplace. We bring customers and independent service providers
              together in one place and run the machinery in between: bookings, written quotes,
              status tracking, payment records, reviews and dispute resolution.
            </p>
            <p className="mt-3">
              We review every provider’s identity and onboarding details. Only the badge for what
              has actually been checked appears on their profile — we claim nothing beyond that.
            </p>
          </section>

          <section>
            <h2 className="text-title text-ink-950">What we are not</h2>
            <ul className="mt-3 space-y-2">
              <li>
                We do not employ technicians. They are independent professionals who offer their own
                services and set their own rates.
              </li>
              <li>We do not claim government licensing, insurance or police background checks.</li>
              <li>
                We do not set prices ourselves. The ranges on the site are estimates only; the
                actual price is set by the provider’s quote, which you approve.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-title text-ink-950">Where we operate</h2>
            <p className="mt-3">
              {city} for now. Service areas are managed from the admin panel, so adding new sectors
              is easy. If your area is not on the list, tell us.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/book">Book a service</ButtonLink>
          <ButtonLink href="/contact" variant="outline">
            Contact us
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
