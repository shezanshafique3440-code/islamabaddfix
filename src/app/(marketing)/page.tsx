import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getCatalogue } from '@/lib/catalogue';
import { recentPlatformReviews } from '@/lib/bookings/reviews';
import { getSetting } from '@/lib/settings';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, DemoBadge } from '@/components/ui/Badge';
import { Rating } from '@/components/ui/Rating';
import { ProblemSearch } from '@/components/marketing/ProblemSearch';
import { CategoryGrid } from '@/components/marketing/CategoryGrid';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { formatPaisaRange } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Islamabad Fix — Problem batao. Baqi hum sambhal lenge.',
  description:
    'Islamabad mein trusted home & business services — verified professionals, transparent quotes aur easy booking. AC, plumbing, electrical, cleaning, carpenter, appliances aur CCTV.',
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
      <section className="relative overflow-hidden border-b border-ink-200">
        {/* A single restrained wash rather than a heavy gradient. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(60%_60%_at_15%_0%,theme(colors.brand.50)_0%,transparent_100%)]"
        />
        <div className="relative mx-auto max-w-content px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
          <div className="max-w-2xl">
            <Badge tone="brand" dot className="mb-5">
              {city} mein live
            </Badge>
            <h1 className="text-display-sm text-ink-950 sm:text-display lg:text-display-lg">
              Problem batao.
              <br />
              <span className="text-brand-700">Baqi hum sambhal lenge.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
              {city} mein trusted home &amp; business services — verified professionals, transparent
              quotes aur easy booking.
            </p>

            <div className="mt-7 max-w-xl">
              <p className="mb-2.5 text-sm font-semibold text-ink-800">
                Aapko kis cheez ki help chahiye?
              </p>
              <ProblemSearch />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/book" size="lg">
                Find a Service
              </ButtonLink>
              <ButtonLink href="/provider-signup" variant="outline" size="lg">
                Become a Provider
              </ButtonLink>
            </div>
          </div>

          {/* Trust strip — every figure is a real count from the database. */}
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-ink-200 pt-8 sm:grid-cols-4">
            <TrustStat
              value={stats.providers > 0 ? `${stats.providers}` : '—'}
              label="Verified technicians"
            />
            <TrustStat
              value={stats.completed > 0 ? `${stats.completed}` : '—'}
              label="Jobs mukammal"
            />
            <TrustStat
              value={stats.rating !== null ? stats.rating.toFixed(1) : '—'}
              label="Average rating"
            />
            <TrustStat
              value={guaranteeEnabled ? `${guaranteeDays} din` : '—'}
              label="Service guarantee"
            />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ popular categories */}
      <section className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-16">
        <SectionHeading
          eyebrow="Popular services"
          title="Kis cheez ka kaam hai?"
          description="Category chunein ya oopar apna masla likh dein — hum sahi service tak pohcha denge."
        />
        <CategoryGrid categories={popular} className="mt-7" />
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="border-y border-ink-200 bg-ink-50/60">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-16">
          <SectionHeading
            eyebrow="How it works"
            title="Char qadam, bas."
            description="Koi technical maloomat ki zaroorat nahi. Aap masla batayein, baqi hum dekh lete hain."
          />
          <div className="mt-9">
            <HowItWorks />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- pricing */}
      <section className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-16">
        <SectionHeading
          eyebrow="Transparent pricing"
          title="Qeemat pehle, kaam baad mein."
          description="Har technician muaina ke baad likhit quote deta hai. Aapki approval ke baghair koi extra charge nahi."
        />
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalogue.slice(0, 6).map((category) => {
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
              <Link
                key={category.slug}
                href={`/services/${category.slug}`}
                className="group rounded-xl border border-ink-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-card"
              >
                <p className="text-sm font-semibold text-ink-900 group-hover:text-brand-700">
                  {category.name}
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  {cheapest !== null ? formatPaisaRange(cheapest, dearest) : 'Quote par'}
                </p>
                <p className="mt-2 text-xs text-ink-400">
                  Indicative range — final qeemat quote se tay hogi
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- emergency */}
      <section className="mx-auto max-w-content px-4 pb-14 sm:px-6 sm:pb-16">
        <div className="flex flex-col gap-5 rounded-2xl border border-alert-200 bg-alert-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">
                🚨
              </span>
              <h2 className="text-title text-ink-950">Emergency service</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">
              Bara water leakage, electrical fault, generator band ya AC emergency? Available
              emergency technicians dekhein. Emergency charges booking confirm karne se pehle saaf
              dikhaye jate hain.
            </p>
            <p className="mt-2 text-xs text-ink-600">
              Aag, gas leak ya kisi ke zakhmi hone ki soorat mein pehle Rescue 1122 ko call karein.
            </p>
          </div>
          <ButtonLink href="/emergency" variant="danger" size="lg" className="shrink-0">
            Emergency technicians
          </ButtonLink>
        </div>
      </section>

      {/* --------------------------------------------------------- reviews */}
      {reviews.length > 0 ? (
        <section className="border-y border-ink-200 bg-ink-50/60">
          <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-16">
            <SectionHeading
              eyebrow="Customer reviews"
              title="Logon ka tajurba"
              description="Review sirf mukammal booking ke baad diya ja sakta hai."
            />
            <div className="mt-7 grid gap-4 lg:grid-cols-3">
              {reviews.map((review) => (
                <figure
                  key={review.id}
                  className="flex flex-col rounded-2xl border border-ink-200 bg-white p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Rating value={review.rating} size="sm" />
                    {review.isDemo ? <DemoBadge /> : null}
                  </div>
                  <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-ink-700">
                    “{review.comment}”
                  </blockquote>
                  <figcaption className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
                    <span className="font-semibold text-ink-800">{review.authorFirstName}</span>
                    {review.zoneName ? ` · ${review.zoneName}` : ''} · {review.serviceName}
                    <br />
                    <Link
                      href={`/providers/${review.providerSlug}`}
                      className="text-brand-700 hover:underline"
                    >
                      {review.providerName}
                    </Link>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------- provider recruiting */}
      <section className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid items-center gap-8 rounded-2xl bg-ink-950 p-7 text-white sm:p-10 lg:grid-cols-2">
          <div>
            <p className="text-eyebrow uppercase text-brand-300">Providers ke liye</p>
            <h2 className="mt-2.5 text-display-sm">
              {city} mein apna service business grow karein.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              Naye customers, digital profile, booking management aur earnings dashboard — mehngi
              marketing ke baghair.
            </p>
            <ButtonLink
              href="/provider-signup"
              size="lg"
              className="mt-6 bg-white text-ink-950 hover:bg-ink-100"
            >
              Join Islamabad Fix
            </ButtonLink>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              'Zyada customers',
              'Zyada jobs',
              'Digital profile',
              'Booking management',
              'Reviews aur rating',
              'Earnings dashboard',
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2.5 text-sm text-ink-200">
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 shrink-0 text-brand-400"
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
      </section>

      {/* ------------------------------------------------------------- FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Aam sawalat" />
        <div className="mt-6 divide-y divide-ink-200 border-y border-ink-200">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-[0.9375rem] font-medium text-ink-900 marker:content-none">
                {item.question}
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5.2 7.5 10 12.3l4.8-4.8-1.1-1.1L10 10.1 6.3 6.4 5.2 7.5Z" />
                </svg>
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{item.answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-ink-500">
          Aur sawal hain?{' '}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Humein batayein
          </Link>
          .
        </p>
      </section>
    </>
  );
}

const FAQ_ITEMS = [
  {
    question: 'Qeemat kaise tay hoti hai?',
    answer:
      'Har technician muaina karne ke baad likhit quote deta hai jismein inspection, labour aur parts alag alag likhe hote hain. Aap approve karein tab kaam shuru hota hai. Beech mein koi extra kharcha nikle to uske liye dobara aapki approval zaroori hai.',
  },
  {
    question: '"Verified" ka kya matlab hai?',
    answer:
      'Iska matlab hai ke humari team ne provider ka shanakhti document aur onboarding maloomat check ki hain, aur unka phone aur email confirm hua hai. Hum government licensing, insurance ya police background check ka dawa nahi karte — jo badge dikhta hai sirf wohi check hua hai.',
  },
  {
    question: 'Kaam theek na ho to?',
    answer:
      'Eligible services par service guarantee laagu hoti hai: agar wohi masla guarantee ki muddat ke andar wapis aa jaye to aap re-visit ki request kar sakte hain. Iske ilawa aap booking par dispute khol sakte hain jise humari team dekhti hai.',
  },
  {
    question: 'Payment kaise hoti hai?',
    answer:
      'Filhaal Cash on Service available hai — kaam mukammal hone par technician ko cash dein aur app mein payment record karein. Online payment ka option baad mein add hoga.',
  },
  {
    question: 'Technicians Islamabad Fix ke mulazim hain?',
    answer:
      'Nahi. Yeh khud-mukhtar (independent) professionals hain jo platform par apni services list karte hain. Islamabad Fix booking, quote aur dispute ka nizam chalata hai.',
  },
];

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-eyebrow uppercase text-brand-700">{eyebrow}</p>
      <h2 className="mt-2 text-display-sm text-ink-950">{title}</h2>
      {description ? (
        <p className="mt-2.5 text-sm leading-relaxed text-ink-600 sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="text-2xl font-bold tracking-tight text-ink-950">{value}</dd>
      <dt className="mt-0.5 text-sm text-ink-500">{label}</dt>
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
