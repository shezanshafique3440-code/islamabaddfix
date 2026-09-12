import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { ButtonLink } from '@/components/ui/Button';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Kaise kaam karta hai',
  description:
    'Islamabad Fix par booking kaise hoti hai — problem batayein, technician chunein, quote approve karein aur kaam mukammal karwayein.',
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
        title="Char qadam, bas."
        description="Aapko technical maloomat ki zaroorat nahi. Masla batayein, baqi hum dekh lete hain."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <HowItWorks />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="text-title text-ink-950">Qeemat kaise tay hoti hai</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-ink-700">
              <li className="flex gap-3">
                <Step n={1} />
                <span>
                  Technician muaina karta hai aur likhit quote bhejta hai jismein inspection, labour
                  aur parts alag alag likhe hote hain.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>
                  Aap quote dekh kar approve ya reject karte hain. Sawal bhi pooch sakte hain.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span>
                  Approve karne ke baad hi kaam shuru hota hai. Beech mein koi extra kharcha nikle
                  to uske liye alag approval leni parti hai — chupke se bill nahi barhta.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={4} />
                <span>Kaam mukammal hone par aap payment karte hain aur review dete hain.</span>
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-title text-ink-950">Trust aur safety</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-700">
              <li>
                <strong className="font-semibold text-ink-900">Verification.</strong> Har provider
                ki shanakht aur onboarding maloomat humari team check karti hai. Sirf wohi badge
                dikhta hai jo waqai verify hua ho.
              </li>
              <li>
                <strong className="font-semibold text-ink-900">Privacy.</strong> Aapka poora address
                aur phone number technician ko tab milta hai jab woh job qubool kar leta hai — pehle
                sirf area dikhta hai.
              </li>
              {guaranteeEnabled ? (
                <li>
                  <strong className="font-semibold text-ink-900">
                    {guaranteeDays}-din Fix Guarantee.
                  </strong>{' '}
                  Eligible services par, agar wohi masla is muddat mein wapis aa jaye to re-visit
                  request kar sakte hain. Har claim ka jaiza hota hai — har service cover nahi hoti.
                </li>
              ) : null}
              <li>
                <strong className="font-semibold text-ink-900">Dispute.</strong> Kaam theek na ho,
                technician na aaye, ya ghalat charge lage to booking par dispute khol dein. Ops team
                dono taraf se baat kar ke faisla karti hai.
              </li>
              <li>
                <strong className="font-semibold text-ink-900">Commission.</strong> Platform har
                mukammal booking par {commissionBp / 100}% commission leta hai. Yeh provider ki
                earning se katta hai, aap se alag charge nahi hota.
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-14 flex flex-wrap gap-3">
          <ButtonLink href="/book" size="lg">
            Service book karein
          </ButtonLink>
          <ButtonLink href="/provider-signup" variant="outline" size="lg">
            Provider banein
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
