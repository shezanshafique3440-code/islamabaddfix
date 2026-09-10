import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicProvider } from '@/lib/providers/visibility';
import { publicReviewsFor } from '@/lib/bookings/reviews';
import { VERIFICATION_LABELS } from '@/lib/providers/service';
import { Avatar } from '@/components/marketing/ProviderCard';
import { Rating } from '@/components/ui/Rating';
import { Badge, DemoBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisa } from '@/lib/money';
import { formatDate, DAY_NAMES, minutesToTimeLabel } from '@/lib/utils';
import { env } from '@/lib/env';
import type { VerificationKind } from '@prisma/client';
import { jsonLdScript } from '@/lib/seo';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const provider = await getPublicProvider(slug);
  if (!provider) return { title: 'Technician nahi mila' };

  const title = `${provider.businessName} — ${provider.city}`;
  const description =
    provider.headline ??
    `${provider.businessName} — Islamabad Fix par verified service provider. ${provider.completedJobs} jobs mukammal.`;

  return {
    title,
    description,
    alternates: { canonical: `/providers/${provider.slug}` },
    openGraph: { title, description, url: `${env.NEXT_PUBLIC_APP_URL}/providers/${provider.slug}` },
  };
}

export default async function ProviderProfilePage({ params }: Params) {
  const { slug } = await params;
  const provider = await getPublicProvider(slug);
  if (!provider) notFound();

  const reviews = await publicReviewsFor(provider.id, { take: 10 });

  /*
   * LocalBusiness markup. aggregateRating is emitted only when real reviews
   * exist, because claiming a rating with no reviews behind it is exactly the
   * kind of fake trust signal this product is meant to avoid.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: provider.businessName,
    description: provider.description ?? provider.headline ?? undefined,
    address: { '@type': 'PostalAddress', addressLocality: provider.city, addressCountry: 'PK' },
    url: `${env.NEXT_PUBLIC_APP_URL}/providers/${provider.slug}`,
    ...(provider.ratingCount > 0 && provider.ratingAverage !== null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: provider.ratingAverage,
            reviewCount: provider.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <div className="border-b border-ink-200 bg-ink-50/60">
        <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
            <Link href="/providers" className="hover:text-brand-700 hover:underline">
              Technicians
            </Link>
            <span aria-hidden="true" className="mx-1.5 text-ink-300">
              /
            </span>
            <span className="text-ink-700">{provider.businessName}</span>
          </nav>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar name={provider.businessName} url={provider.photoUrl} size="lg" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-display-sm text-ink-950">{provider.businessName}</h1>
                {provider.isDemo ? <DemoBadge /> : null}
              </div>
              {provider.headline ? (
                <p className="mt-1 text-[0.9375rem] text-ink-600">{provider.headline}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Rating value={provider.ratingAverage} count={provider.ratingCount} />
                <span className="text-sm text-ink-600">
                  <strong className="font-semibold text-ink-900">{provider.completedJobs}</strong>{' '}
                  jobs mukammal
                </span>
                {provider.yearsExperience > 0 ? (
                  <span className="text-sm text-ink-600">
                    <strong className="font-semibold text-ink-900">
                      {provider.yearsExperience}
                    </strong>{' '}
                    saal tajurba
                  </span>
                ) : null}
                {provider.avgResponseMinutes !== null ? (
                  <span className="text-sm text-ink-600">
                    Jawab ~
                    <strong className="font-semibold text-ink-900">
                      {provider.avgResponseMinutes} min
                    </strong>
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {provider.badges.map((badge) => (
                  <Badge key={badge.kind} tone="brand">
                    ✓ {badge.label}
                  </Badge>
                ))}
                {provider.emergencyAvailable ? (
                  <Badge tone="danger">🚨 Emergency available</Badge>
                ) : null}
              </div>
            </div>

            <div className="shrink-0">
              <ButtonLink href={`/book?provider=${provider.slug}`} size="lg">
                Book Now
              </ButtonLink>
              <p className="mt-2 max-w-[14rem] text-xs text-ink-500">
                Booking ke baad hi contact details share hoti hain.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            {provider.description ? (
              <section>
                <h2 className="text-title text-ink-950">Baare mein</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {provider.description}
                </p>
              </section>
            ) : null}

            <section aria-labelledby="services-heading">
              <h2 id="services-heading" className="text-title text-ink-950">
                Services aur rates
              </h2>
              <ul className="mt-4 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
                {provider.services.map((service) => (
                  <li
                    key={service.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/services/detail/${service.slug}`}
                        className="text-sm font-medium text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {service.name}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {service.category.name} ·{' '}
                        {service.requiresInspection
                          ? 'Muaina ke baad quote'
                          : `~${service.estimatedMinutes} min`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-ink-900">
                        {formatPaisa(service.startingPricePaisa)} se
                      </span>
                      <ButtonLink
                        href={`/book?service=${service.slug}&provider=${provider.slug}`}
                        variant="outline"
                        size="sm"
                      >
                        Book
                      </ButtonLink>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">
                Yeh starting rates hain. Final qeemat muaina ke baad quote se tay hoti hai.
              </p>
            </section>

            <section aria-labelledby="reviews-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="reviews-heading" className="text-title text-ink-950">
                  Reviews
                </h2>
                <Rating value={provider.ratingAverage} count={provider.ratingCount} size="sm" />
              </div>

              {reviews.items.length > 0 ? (
                <ul className="mt-4 space-y-4">
                  {reviews.items.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-xl border border-ink-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <Rating value={review.rating} size="sm" />
                          <span className="text-sm font-medium text-ink-800">
                            {review.authorFirstName}
                          </span>
                          {review.isDemo ? <DemoBadge /> : null}
                        </div>
                        <span className="text-xs text-ink-400">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
                          {review.comment}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-ink-500">{review.serviceName}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  className="mt-4"
                  title="Abhi koi review nahi"
                  description="Review sirf mukammal booking ke baad customer de sakta hai."
                />
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-ink-200 bg-white p-5">
              <h2 className="text-eyebrow uppercase text-ink-500">Verification</h2>
              <ul className="mt-3 space-y-3">
                {provider.badges.map((badge) => {
                  const info = VERIFICATION_LABELS[badge.kind as VerificationKind];
                  return (
                    <li key={badge.kind} className="flex gap-2.5">
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3-1.4-1.4L9 10.6 7.7 9.3l-1.4 1.4 2.7 2.7 4.7-4.7Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-ink-900">{badge.label}</p>
                        {info ? (
                          <p className="text-xs leading-relaxed text-ink-500">{info.help}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {/* Explicit limit on what the badges mean. */}
              <p className="mt-4 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
                Yeh independent service provider hai, Islamabad Fix ka mulazim nahi. Hum government
                licensing, insurance ya police background check ka dawa nahi karte.
              </p>
            </div>

            <div className="rounded-2xl border border-ink-200 bg-white p-5">
              <h2 className="text-eyebrow uppercase text-ink-500">Service areas</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {provider.zones.map((zone) => (
                  <span
                    key={zone.slug}
                    className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700"
                  >
                    {zone.name}
                  </span>
                ))}
              </div>
            </div>

            {provider.availability.length > 0 ? (
              <div className="rounded-2xl border border-ink-200 bg-white p-5">
                <h2 className="text-eyebrow uppercase text-ink-500">Working hours</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {provider.availability.map((window, index) => (
                    <div
                      key={`${window.dayOfWeek}-${index}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <dt className="text-ink-600">{DAY_NAMES[window.dayOfWeek]}</dt>
                      <dd className="font-medium text-ink-900">
                        {minutesToTimeLabel(window.startMinute)} –{' '}
                        {minutesToTimeLabel(window.endMinute)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="rounded-2xl border border-ink-200 bg-white p-5 text-sm">
              <h2 className="text-eyebrow uppercase text-ink-500">Platform par</h2>
              <p className="mt-2 text-ink-700">{formatDate(provider.memberSince)} se</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
