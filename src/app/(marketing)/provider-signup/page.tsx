import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { getSetting } from '@/lib/settings';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Become a provider — grow your service business',
  description:
    'Grow your service business in Islamabad. New customers, a digital profile, booking management and an earnings dashboard — without expensive marketing.',
  alternates: { canonical: '/provider-signup' },
};

export default async function ProviderSignupPage() {
  const [city, commissionBp, categories] = await Promise.all([
    getSetting('platform.city'),
    getSetting('platform.commissionRateBp'),
    prisma.serviceCategory.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { name: true },
    }),
  ]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-200">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(55%_55%_at_85%_0%,theme(colors.brand.50)_0%,transparent_100%)]"
        />
        <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-eyebrow uppercase text-brand-700">For providers</p>
            <h1 className="mt-2.5 text-display-sm text-ink-950 sm:text-display">
              Grow your service business in {city}.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-600 sm:text-lg">
              Your work is good — you just need a way to reach customers. Build your profile on
              Islamabad Fix, receive jobs and track your earnings.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/register?role=provider" size="lg">
                Join Islamabad Fix
              </ButtonLink>
              <ButtonLink href="#how" variant="outline" size="lg">
                How it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-500">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-brand-700 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
        <section aria-labelledby="benefits">
          <h2 id="benefits" className="text-display-sm text-ink-950">
            What you get
          </h2>
          <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'More customers',
                body: 'People see your profile when they search for a service in Islamabad — no contacts needed.',
              },
              {
                title: 'Digital profile',
                body: 'Your rating, completed jobs, experience and verification badges in one place — your reputation, online.',
              },
              {
                title: 'Booking management',
                body: 'Today’s jobs, the address, the problem, photos and the time — all on one dashboard.',
              },
              {
                title: 'Written quotes',
                body: 'Send the quote with inspection, labour and parts listed separately. Work starts only after approval.',
              },
              {
                title: 'Earnings dashboard',
                body: 'Today’s, this week’s and this month’s earnings, commission and pending payout, all clearly shown.',
              },
              {
                title: 'Reviews',
                body: 'Good work earns reviews, and reviews move you up in matching.',
              },
            ].map((benefit) => (
              <li key={benefit.title}>
                <h3 className="text-[0.9375rem] font-semibold text-ink-900">{benefit.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{benefit.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="mt-16 scroll-mt-20">
          <h2 className="text-display-sm text-ink-950">How to get started</h2>
          <ol className="mt-7 space-y-6">
            {[
              {
                title: 'Create account',
                body: 'Create a provider account with your name, phone and email.',
              },
              {
                title: 'Complete your profile',
                body: 'Add your services and starting rates, service areas, working hours and experience. Attach an identity document as well.',
              },
              {
                title: 'Wait for review',
                body: 'Our team checks your details. Until you are approved, your profile is not shown to customers — that is what keeps the badge meaningful.',
              },
              {
                title: 'Receive jobs',
                body: 'Once you are approved, matching jobs are offered to you. Accept, inspect, send a quote and complete the work.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white dark:text-brand-50">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-ink-200 bg-surface p-6">
            <h2 className="text-title text-ink-950">What it costs</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              No fee to build a profile or to be listed. The platform takes{' '}
              <strong className="font-semibold text-ink-900">
                {commissionBp / 100}% commission
              </strong>{' '}
              on completed bookings only, out of your earnings. No work, nothing to pay.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              The commission rate is held in platform settings, and each booking freezes the rate in
              force at the time it completes — a later change to the rate does not affect bookings
              already done.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-surface p-6">
            <h2 className="text-title text-ink-950">Which services?</h2>
            <p className="mt-3 text-sm text-ink-700">We need providers in these categories:</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <span
                  key={category.name}
                  className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700"
                >
                  {category.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-14 rounded-2xl bg-panel p-8 text-center text-panel-fg">
          <h2 className="text-display-sm">Ready to get started?</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-panel-muted">
            Creating an account takes two minutes. Review starts once your profile is complete.
          </p>
          <ButtonLink
            href="/register?role=provider"
            size="lg"
            className="mt-6 bg-panel-fg text-panel hover:opacity-90"
          >
            Join Islamabad Fix
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
