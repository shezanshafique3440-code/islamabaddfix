import Link from 'next/link';
import Image from 'next/image';
import { Rating } from '@/components/ui/Rating';
import { Badge, DemoBadge, VerifiedBadge } from '@/components/ui/Badge';
import { formatPaisa } from '@/lib/money';
import { initials, cn } from '@/lib/utils';

export interface ProviderCardData {
  id: string;
  slug: string;
  businessName: string;
  headline: string | null;
  photoUrl: string | null;
  yearsExperience: number;
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  avgResponseMinutes: number | null;
  emergencyAvailable: boolean;
  emergencyFeePaisa: number;
  startingPricePaisa?: number;
  distanceKm?: number;
  distanceIsEstimate?: boolean;
  badges?: Array<{ kind: string; label: string }>;
  verifiedIdentity?: boolean;
  verifiedPhone?: boolean;
  isDemo?: boolean;
}

/**
 * Provider card.
 *
 * Shows only trust signals that are backed by data: rating, completed jobs,
 * years of experience, and badges derived from APPROVED verification rows. No
 * phone number, no address, and distance is labelled "approx." when it came
 * from a zone centroid rather than a GPS pin.
 */
export function ProviderCard({
  provider,
  action,
  className,
}: {
  provider: ProviderCardData;
  action?: React.ReactNode;
  className?: string;
}) {
  const badges =
    provider.badges ??
    [
      provider.verifiedIdentity ? { kind: 'IDENTITY_CNIC', label: 'Identity verified' } : null,
      provider.verifiedPhone ? { kind: 'PHONE', label: 'Phone verified' } : null,
    ].filter((badge): badge is { kind: string; label: string } => badge !== null);

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-4 transition-shadow hover:shadow-lift sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <Avatar name={provider.businessName} url={provider.photoUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/providers/${provider.slug}`}
              className="truncate text-[0.9375rem] font-semibold text-ink-900 hover:text-brand-700 hover:underline"
            >
              {provider.businessName}
            </Link>
            {provider.isDemo ? <DemoBadge /> : null}
          </div>

          {provider.headline ? (
            <p className="mt-0.5 line-clamp-1 text-sm text-ink-600">{provider.headline}</p>
          ) : null}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Rating value={provider.ratingAverage} count={provider.ratingCount} size="sm" />
            <span className="text-xs text-ink-500">
              {provider.completedJobs} jobs mukammal
            </span>
            {provider.yearsExperience > 0 ? (
              <span className="text-xs text-ink-500">{provider.yearsExperience} saal tajurba</span>
            ) : null}
          </div>
        </div>
      </div>

      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {badges.map((badge) => (
            <VerifiedBadge key={badge.kind} label={badge.label} />
          ))}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-ink-100 pt-3 text-sm sm:grid-cols-4">
        {provider.startingPricePaisa !== undefined ? (
          <Stat label="Shuru" value={formatPaisa(provider.startingPricePaisa)} emphasis />
        ) : null}
        {provider.distanceKm !== undefined ? (
          <Stat
            label="Faasla"
            value={
              provider.distanceIsEstimate
                ? `~${provider.distanceKm} km`
                : `${provider.distanceKm} km`
            }
            hint={provider.distanceIsEstimate ? 'Andazan, area ke hisaab se' : undefined}
          />
        ) : null}
        {provider.avgResponseMinutes !== null ? (
          <Stat label="Jawab" value={`~${provider.avgResponseMinutes} min`} />
        ) : (
          <Stat label="Jawab" value="Naya" />
        )}
        <Stat
          label="Emergency"
          value={provider.emergencyAvailable ? 'Available' : 'Nahi'}
        />
      </dl>

      {provider.emergencyAvailable && provider.emergencyFeePaisa > 0 ? (
        <Badge tone="warn" className="self-start">
          Emergency fee {formatPaisa(provider.emergencyFeePaisa)}
        </Badge>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-sm',
          emphasis ? 'font-semibold text-ink-900' : 'text-ink-700',
        )}
        title={hint}
      >
        {value}
      </dd>
    </div>
  );
}

export function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-9 w-9 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-base' }[size];
  const pixels = { sm: 36, md: 48, lg: 64 }[size];

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={pixels}
        height={pixels}
        className={cn('shrink-0 rounded-full object-cover', box)}
        // Provider photos come through the authorized file route, which does not
        // support Next's optimizer pipeline.
        unoptimized
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800',
        box,
      )}
    >
      {initials(name)}
    </span>
  );
}
