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
                    className="group relative flex flex-col overflow-hidden rounded-3xl border border-ink-200 bg-surface p-7 transition-all duration-200 ease-spring hover:-translate-y-1 hover:border-brand-300 hover:shadow-e3"
                  >
                    {/* A brand rule along the top edge, and a wash behind the
                        price. Decoration only — the plan itself is whatever the
                        admin configured. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-brand-600 to-brand-800"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgb(var(--c-brand-400)/0.16)_0%,transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    />

                    <h2 className="relative text-title text-ink-950">{plan.name}</h2>
                    {plan.tagline ? (
                      <p className="relative mt-1 text-sm text-ink-600">{plan.tagline}</p>
                    ) : null}

                    <p className="relative mt-6 font-display text-4xl font-bold tracking-tight text-ink-950">
                      {formatPaisa(plan.pricePaisa)}
                      <span className="ml-1.5 font-sans text-sm font-medium text-ink-500">
                        / {plan.periodDays} days
                      </span>
                    </p>

                    <p className="relative mt-4 text-sm leading-relaxed text-ink-700">
                      {plan.description}
                    </p>

                    {benefits.length > 0 ? (
                      <ul className="relative mt-6 flex-1 space-y-3 border-t border-ink-100 pt-6 text-sm text-ink-700">
                        {benefits.map((benefit) => (
                          <li key={benefit} className="flex gap-3">
                            <span
                              aria-hidden="true"
                              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[0.625rem] font-bold text-brand-700"
                            >
                              ✓
                            </span>
                            <span className="leading-relaxed">{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="relative mt-7 pt-1">
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
            <section className="mt-14 rounded-3xl border border-ink-200 bg-surface-sunken p-7 sm:p-8">
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
