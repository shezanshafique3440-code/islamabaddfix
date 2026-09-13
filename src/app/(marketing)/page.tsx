import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getCatalogue } from '@/lib/catalogue';
import { recentPlatformReviews } from '@/lib/bookings/reviews';
import { getSetting } from '@/lib/settings';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, DemoBadge } from '@/components/ui/Badge';
import { Rating } from '@/components/ui/Rating';
import { Reveal, CountUp } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/marketing/SectionHeading';
import { ProblemSearch } from '@/components/marketing/ProblemSearch';
import { CategoryGrid } from '@/components/marketing/CategoryGrid';
import { HeroArt } from '@/components/marketing/HeroArt';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { formatPaisaRange } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Islamabad Fix — Tell us the problem. We will handle the rest.',
  description:
    'Trusted home and business services in Islamabad — verified professionals, transparent quotes and easy booking. AC, plumbing, electrical, cleaning, carpentry, appliances and CCTV.',
  alternates: { canonical: '/' },
};

// The home page reads live counts and reviews; a short revalidation window
// keeps it fast without going stale on a network this size.
export const revalidate = 300;

export default async function HomePage() {
  const [catalogue, reviews, stats, guaranteeDays, guaranteeEnabled, city] = await Promise.all([
    getCatalogue(),
    recentPlatformReviews(3),
    loadTrustStats(),
    getSetting('guarantee.days'),
    getSetting('guarantee.enabled'),
    getSetting('platform.city'),
  ]);

  const popular = catalogue.slice(0, 7).map((category) => ({
    name: category.name,
    slug: category.slug,
    iconKey: category.iconKey,
    serviceCount: category.services.length,
  }));

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden border-b border-ink-200">
        {/*
         * Four stacked layers, none of which carry meaning: a masked grid for
         * structure, two slow brand washes for depth, and grain so the washes
         * do not band on the cheap panels most of this audience is holding.
         * All of it is decorative and pointer-transparent.
         */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="grid-lines absolute inset-0 opacity-60" />
          <div className="absolute -left-[10%] -top-[35%] h-[36rem] w-[36rem] animate-drift rounded-full bg-[radial-gradient(circle,rgb(var(--c-brand-400)/calc(0.22*var(--wash-strength)))_0%,transparent_70%)] blur-2xl" />
          <div className="absolute -right-[12%] top-[8%] h-[30rem] w-[30rem] animate-drift-slow rounded-full bg-[radial-gradient(circle,rgb(var(--c-info-400)/calc(0.14*var(--wash-strength)))_0%,transparent_70%)] blur-2xl" />
          <div className="grain absolute inset-0" />
        </div>

        <div className="relative mx-auto max-w-content px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div>
              <Badge tone="brand" live className="mb-6">
                Live in {city}
              </Badge>
              <h1 className="text-display text-ink-950 sm:text-display-lg 2xl:text-display-xl">
                Tell us the problem.
                <br />
                <span className="text-gradient">We will handle the rest.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                Trusted home &amp; business services in {city} — verified professionals, transparent
                quotes and easy booking.
              </p>

              {/*
               * The search sits on its own raised surface rather than floating
               * on the wash. It is the one thing on this page we want a thumb
               * to go to, so it gets the elevation and nothing else does.
               */}
              <div className="mt-9 rounded-2xl border border-ink-200 bg-surface/80 p-4 shadow-e2 backdrop-blur-sm sm:p-5">
                <p className="mb-3 text-sm font-semibold text-ink-800">
                  What do you need help with?
                </p>
                <ProblemSearch />
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/book" size="lg">
                  Find a Service
                </ButtonLink>
                <ButtonLink href="/provider-signup" variant="outline" size="lg">
                  Become a Provider
                </ButtonLink>
              </div>
            </div>

            <HeroArt
              iconKeys={popular.map((category) => category.iconKey)}
              className="hidden lg:block"
            />
          </div>

          {/* Trust strip — every figure is a real count from the database. */}
          <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 sm:grid-cols-4">
            <TrustStat
              value={stats.providers}
              label="Verified technicians"
              caption="Identity and contact checked"
            />
            <TrustStat
              value={stats.completed}
              label="Jobs completed"
              caption="Marked complete in the app"
            />
            <TrustStat
              value={stats.rating}
              decimals={1}
              label="Average rating"
              caption="From reviews after a booking"
            />
            <TrustStat
              value={guaranteeEnabled ? guaranteeDays : null}
              suffix=" days"
              label="Service guarantee"
              caption="On eligible services"
            />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ popular categories */}
      <section className="mx-auto max-w-content px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <SectionHeading
            eyebrow="Popular services"
            title="What is the work for?"
            description="Pick a category or describe your problem above — we will get you to the right service."
          />
        </Reveal>
        <Reveal delay={80}>
          <CategoryGrid categories={popular} className="mt-8" />
        </Reveal>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="relative overflow-hidden border-y border-ink-200 bg-surface-sunken">
        <div aria-hidden="true" className="grain pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-content px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="Four steps, that is all."
              description="No technical knowledge needed. Describe the problem and we will handle the rest."
            />
          </Reveal>
          <div className="mt-10">
            <HowItWorks />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- pricing */}
      <section className="mx-auto max-w-content px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <SectionHeading
            eyebrow="Transparent pricing"
            title="Price first, work after."
            description="Every technician gives a written quote after inspecting. No extra charge without your approval."
          />
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalogue.slice(0, 6).map((category, index) => {
            const cheapest = category.services.reduce<number | null>(
              (min, service) =>
                min === null ? service.minPricePaisa : Math.min(min, service.minPricePaisa),
              null,
            );
            const dearest = category.services.reduce<number | null>(
              (max, service) =>
                service.maxPricePaisa === null
                  ? max
                  : max === null
                    ? service.maxPricePaisa
                    : Math.max(max, service.maxPricePaisa),
              null,
            );
            return (
              <Reveal key={category.slug} delay={index * 50}>
                <Link
                  href={`/services/${category.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-surface p-5 transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2"
                >
                  {/* A brand wash that only appears on hover, behind the text. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(var(--c-brand-400)/0.14)_0%,transparent_100%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <p className="text-[0.9375rem] font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                      {category.name}
                    </p>
                    <Arrow />
                  </div>
                  <p className="relative mt-2 font-display text-lg font-bold tracking-tight text-ink-950">
                    {cheapest !== null ? formatPaisaRange(cheapest, dearest) : 'On quote'}
                  </p>
                  <p className="relative mt-2 text-xs leading-relaxed text-ink-500">
                    Indicative range — the final price is set by the quote
                  </p>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- emergency */}
      <section className="mx-auto max-w-content px-4 pb-16 sm:px-6 sm:pb-20">
        <Reveal>
          <div className="relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-alert-200 bg-alert-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgb(var(--c-alert-400)/0.2)_0%,transparent_70%)]"
            />
            <div className="relative max-w-xl">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-alert-100 text-lg">
                  <span aria-hidden="true">🚨</span>
                </span>
                <h2 className="text-title text-ink-950">Emergency service</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Major water leak, electrical fault, generator down or an AC emergency? See the
                emergency technicians available now. Emergency charges are shown clearly before you
                confirm the booking.
              </p>
              <p className="mt-2 text-xs text-ink-600">
                If there is fire, a gas leak or an injury, call Rescue 1122 first.
              </p>
            </div>
            <ButtonLink href="/emergency" variant="danger" size="lg" className="relative shrink-0">
              Emergency technicians
            </ButtonLink>
          </div>
        </Reveal>
      </section>

      {/* --------------------------------------------------------- reviews */}
      {reviews.length > 0 ? (
        <section className="relative overflow-hidden border-y border-ink-200 bg-surface-sunken">
          <div aria-hidden="true" className="grain pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-content px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <SectionHeading
                eyebrow="Customer reviews"
                title="What people say"
                description="A review can only be left after a booking is complete."
              />
            </Reveal>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {reviews.map((review, index) => (
                <Reveal key={review.id} delay={index * 70}>
                  <figure className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-surface p-6 shadow-e1">
                    {/* An oversized quote mark, set as decoration rather than text. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-1 -top-5 select-none font-display text-[6rem] font-bold leading-none text-ink-100"
                    >
                      &rdquo;
                    </span>
                    <div className="relative flex items-center justify-between gap-2">
                      <Rating value={review.rating} size="sm" />
                      {review.isDemo ? <DemoBadge /> : null}
                    </div>
                    <blockquote className="relative mt-4 flex-1 text-[0.9375rem] leading-relaxed text-ink-700">
                      {review.comment}
                    </blockquote>
                    <figcaption className="relative mt-5 flex items-center gap-3 border-t border-ink-100 pt-4 text-xs text-ink-500">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-200"
                      >
                        {review.authorFirstName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink-800">
                          {review.authorFirstName}
                          {review.zoneName ? ` · ${review.zoneName}` : ''}
                        </span>
                        <span className="block truncate">
                          {review.serviceName} ·{' '}
                          <Link
                            href={`/providers/${review.providerSlug}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {review.providerName}
                          </Link>
                        </span>
                      </span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------- provider recruiting */}
      <section className="mx-auto max-w-content px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <div className="relative isolate grid items-center gap-8 overflow-hidden rounded-3xl bg-panel p-7 text-panel-fg shadow-e3 sm:p-11 lg:grid-cols-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgb(var(--c-brand-500)/0.3)_0%,transparent_70%)]" />
              <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgb(var(--c-info-500)/0.16)_0%,transparent_70%)]" />
              <div className="grain absolute inset-0" />
            </div>
            <div>
              <p className="text-eyebrow uppercase text-brand-300 dark:text-brand-700">
                For providers
              </p>
              <h2 className="mt-3 text-display-sm sm:text-display">
                Grow your service business in {city}.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-panel-muted">
                New customers, a digital profile, booking management and an earnings dashboard —
                without expensive marketing.
              </p>
              <ButtonLink
                href="/provider-signup"
                size="lg"
                className="mt-7 bg-panel-fg text-panel shadow-e2 hover:opacity-90"
              >
                Join Islamabad Fix
              </ButtonLink>
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {[
                'More customers',
                'More jobs',
                'Digital profile',
                'Booking management',
                'Reviews and ratings',
                'Earnings dashboard',
              ].map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-center gap-2.5 rounded-xl bg-panel-fg/5 px-3.5 py-2.5 text-sm text-panel-fg/85 ring-1 ring-inset ring-panel-fg/10"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0 text-brand-400 dark:text-brand-700"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3-1.4-1.4L9 10.6 7.7 9.3l-1.4 1.4 2.7 2.7 4.7-4.7Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------- FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title="Common questions" />
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQ_ITEMS.map((item, index) => (
            <Reveal key={item.question} delay={index * 40}>
              <details className="group overflow-hidden rounded-2xl border border-ink-200 bg-surface transition-colors open:border-brand-200 open:bg-brand-50/30 hover:border-ink-300">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[0.9375rem] font-medium text-ink-900 marker:content-none">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition-all duration-200 group-open:rotate-180 group-open:bg-brand-100 group-open:text-brand-700"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                      <path d="M5.2 7.5 10 12.3l4.8-4.8-1.1-1.1L10 10.1 6.3 6.4 5.2 7.5Z" />
                    </svg>
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-600">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-ink-500">
          More questions?{' '}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Tell us
          </Link>
          .
        </p>
      </section>
    </>
  );
}

const FAQ_ITEMS = [
  {
    question: 'How is the price decided?',
    answer:
      'Every technician gives a written quote after inspecting, with inspection, labour and parts listed separately. Work starts only once you approve. If any extra cost comes up midway, that needs your approval again.',
  },
  {
    question: 'What does "Verified" mean?',
    answer:
      'It means our team has checked the provider’s identity document and onboarding details, and confirmed their phone and email. We do not claim government licensing, insurance or police background checks — only the badge shown has actually been checked.',
  },
  {
    question: 'What if the work is not right?',
    answer:
      'The service guarantee applies to eligible services: if the same problem returns within the guarantee period, you can request a re-visit. You can also open a dispute on the booking, which our team reviews.',
  },
  {
    question: 'How does payment work?',
    answer:
      'Cash on Service is available for now — pay the technician in cash when the work is done and record the payment in the app. Online payment will be added later.',
  },
  {
    question: 'Are technicians employed by Islamabad Fix?',
    answer:
      'No. They are independent professionals who list their services on the platform. Islamabad Fix runs the booking, quote and dispute system.',
  },
];

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500 transition-all duration-200 group-hover:bg-brand-600 group-hover:text-white dark:group-hover:text-brand-50"
    >
      <svg
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 10h11M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * One figure in the trust strip.
 *
 * `null` means the number does not exist yet, and renders an em dash rather
 * than a zero dressed up as a milestone. The caption underneath says what the
 * figure actually counts, so none of the four can be read as a bigger claim
 * than it is.
 */
function TrustStat({
  value,
  label,
  caption,
  decimals = 0,
  suffix = '',
}: {
  value: number | null;
  label: string;
  caption: string;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <div className="bg-surface px-4 py-5 sm:px-5">
      <dd className="font-display text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
        {value === null || value === 0 ? (
          '—'
        ) : (
          <CountUp value={value} decimals={decimals} suffix={suffix} />
        )}
      </dd>
      <dt className="mt-1 text-sm font-medium text-ink-800">{label}</dt>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{caption}</p>
    </div>
  );
}

/**
 * Real platform figures. An em dash is rendered where a number does not exist
 * yet rather than a zero dressed up as a milestone.
 */
async function loadTrustStats() {
  const [providers, completed, rating] = await Promise.all([
    prisma.providerProfile.count({ where: { status: 'VERIFIED', deletedAt: null } }),
    prisma.booking.count({ where: { status: 'COMPLETED', deletedAt: null } }),
    prisma.review.aggregate({
      where: { isPublished: true, rating: { gt: 0 } },
      _avg: { rating: true },
    }),
  ]);
  return { providers, completed, rating: rating._avg.rating };
}
