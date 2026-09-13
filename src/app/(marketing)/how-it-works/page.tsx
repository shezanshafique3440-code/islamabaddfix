import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { ButtonLink } from '@/components/ui/Button';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How booking works on Islamabad Fix — describe the problem, pick a technician, approve the quote and get the work done.',
  alternates: { canonical: '/how-it-works' },
};

export default async function HowItWorksPage() {
  const [guaranteeDays, guaranteeEnabled, commissionBp] = await Promise.all([
    getSetting('guarantee.days'),
    getSetting('guarantee.enabled'),
    getSetting('platform.commissionRateBp'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="Four steps, that is all."
        description="You do not need to know the technical details. Describe the problem and we take it from there."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <HowItWorks />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="text-title text-ink-950">How the price is decided</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-ink-700">
              <li className="flex gap-3">
                <Step n={1} />
                <span>
                  The technician inspects and sends a written quote listing inspection, labour and
                  parts separately.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>
                  You review the quote and approve or decline it. You can ask questions too.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span>
                  Work only starts after you approve. If any extra cost comes up midway, it needs
                  your separate approval — the bill never grows quietly.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={4} />
                <span>When the work is complete you pay and leave a review.</span>
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-title text-ink-950">Trust and safety</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-700">
              <li>
                <strong className="font-semibold text-ink-900">Verification.</strong> Our team
                checks every provider’s identity and onboarding details. Only badges that have
                actually been verified are shown.
              </li>
              <li>
                <strong className="font-semibold text-ink-900">Privacy.</strong> The technician gets
                your full address and phone number once they accept the job — before that they see
                only the area.
              </li>
              {guaranteeEnabled ? (
                <li>
                  <strong className="font-semibold text-ink-900">
                    {guaranteeDays}-day Fix Guarantee.
                  </strong>{' '}
                  On eligible services, if the same problem returns within this period, you can
                  request a re-visit. Every claim is reviewed — not every service is covered.
                </li>
              ) : null}
              <li>
                <strong className="font-semibold text-ink-900">Dispute.</strong> If the work is not
                right, the technician does not turn up, or you are charged wrongly, open a dispute
                on the booking. The ops team hears both sides and decides.
              </li>
              <li>
                <strong className="font-semibold text-ink-900">Commission.</strong> The platform
                takes {commissionBp / 100}% commission on every completed booking. It comes out of
                the provider’s earnings, never as a separate charge to you.
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-14 flex flex-wrap gap-3">
          <ButtonLink href="/book" size="lg">
            Book a service
          </ButtonLink>
          <ButtonLink href="/provider-signup" variant="outline" size="lg">
            Become a provider
          </ButtonLink>
        </div>
      </div>
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
      {n}
    </span>
  );
}
