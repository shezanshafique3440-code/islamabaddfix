import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisa } from '@/lib/money';
import { describeBenefits, listPublicPlans } from '@/lib/memberships';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Membership — lower prices on every visit',
  description:
    'An Islamabad Fix membership discounts every completed booking, covers part of the emergency call-out fee and extends the re-visit guarantee.',
  alternates: { canonical: '/membership' },
};

export const revalidate = 300;

export default async function MembershipPage() {
  const [enabled, plans, city] = await Promise.all([
    getSetting('memberships.enabled'),
    listPublicPlans(),
    getSetting('platform.city'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Pay less, every visit"
        description={`One yearly payment. Every booking you make in ${city} after that costs less, and the guarantee runs longer.`}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        {!enabled || plans.length === 0 ? (
          <EmptyState
            title="Memberships are not open yet"
            description="We are not selling membership plans right now. Every service on the platform works exactly the same without one."
            action={{ label: 'Book a service', href: '/book' }}
          />
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => {
                const benefits = describeBenefits(plan);
                return (
                  <section
                    key={plan.id}
                    className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 transition-shadow hover:shadow-card"
                  >
                    <h2 className="text-title text-ink-950">{plan.name}</h2>
                    {plan.tagline ? (
                      <p className="mt-1 text-sm text-ink-600">{plan.tagline}</p>
                    ) : null}

                    <p className="mt-5 text-3xl font-bold tracking-tight text-ink-950">
                      {formatPaisa(plan.pricePaisa)}
                      <span className="ml-1.5 text-sm font-medium text-ink-500">
                        / {plan.periodDays} days
                      </span>
                    </p>

                    <p className="mt-4 text-sm leading-relaxed text-ink-700">{plan.description}</p>

                    {benefits.length > 0 ? (
                      <ul className="mt-5 space-y-2.5 border-t border-ink-100 pt-5 text-sm text-ink-700">
                        {benefits.map((benefit) => (
                          <li key={benefit} className="flex gap-2.5">
                            <span aria-hidden="true" className="text-brand-600">
                              ✓
                            </span>
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-6 pt-1">
                      <ButtonLink href={`/account/membership?plan=${plan.code}`} fullWidth>
                        Choose {plan.name}
                      </ButtonLink>
                    </div>
                  </section>
                );
              })}
            </div>

            {/* What a membership is not. Stated here rather than in the small
                print, because a discount card is exactly the kind of product
                people expect to be quietly disappointed by. */}
            <section className="mt-12 rounded-2xl border border-ink-200 bg-ink-50/60 p-6">
              <h2 className="text-title text-ink-950">What a membership does not do</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-700">
                <li>
                  It does not make the work free. You still approve a written quote before any job
                  starts, and the discount comes off that agreed price.
                </li>
                <li>
                  It does not cover a service the guarantee excludes. Bonus days extend a guarantee
                  that already applies; they never create one where there is none.
                </li>
                <li>
                  It does not put you ahead of an emergency. Your request simply reaches more
                  technicians at once, which usually means a faster acceptance.
                </li>
                <li>
                  It is not a subscription that renews itself. When the period ends, it ends —
                  nothing is charged again without you asking.
                </li>
              </ul>
              <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
                Full terms are in the{' '}
                <Link href="/terms" className="font-medium text-brand-700 hover:underline">
                  terms of use
                </Link>
                .
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}
