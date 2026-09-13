'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { NotConfiguredNotice } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface BookingPin {
  id: string;
  reference: string;
  status: string;
  isEmergency: boolean;
  scheduledFor: string | null;
  serviceName: string;
  providerName: string | null;
  zoneName: string;
  hasPreciseArea: boolean;
}

interface ProviderPin {
  id: string;
  businessName: string;
  emergencyAvailable: boolean;
  activeJobs: number;
  locationStatus: 'live' | 'stale' | 'sharing_off';
  zoneNames: string[];
}

/**
 * Operations view, grouped by service area.
 *
 * With no maps provider configured there is no tile layer to draw on, so this
 * renders the same operational information as a zone board rather than an empty
 * grey rectangle. That is a genuinely useful view — dispatch decisions are made
 * per sector — and it means the page works on day one.
 */
export function OpsMap({
  mapsConfigured,
  bookings,
  providers,
  zones,
}: {
  mapsConfigured: boolean;
  bookings: BookingPin[];
  providers: ProviderPin[];
  zones: Array<{ id: string; name: string; hasCentroid: boolean }>;
}) {
  const [filter, setFilter] = useState<'all' | 'emergency' | 'unassigned'>('all');

  const filtered = useMemo(
    () =>
      bookings.filter((booking) => {
        if (filter === 'emergency') return booking.isEmergency;
        if (filter === 'unassigned') return booking.providerName === null;
        return true;
      }),
    [bookings, filter],
  );

  // Group demand and supply by zone name — the unit dispatch actually works in.
  const byZone = useMemo(() => {
    const map = new Map<
      string,
      { bookings: BookingPin[]; providers: ProviderPin[]; hasCentroid: boolean }
    >();
    for (const zone of zones) {
      map.set(zone.name, { bookings: [], providers: [], hasCentroid: zone.hasCentroid });
    }
    for (const booking of filtered) {
      const entry = map.get(booking.zoneName) ?? {
        bookings: [],
        providers: [],
        hasCentroid: false,
      };
      entry.bookings.push(booking);
      map.set(booking.zoneName, entry);
    }
    for (const provider of providers) {
      for (const zoneName of provider.zoneNames) {
        const entry = map.get(zoneName);
        if (entry) entry.providers.push(provider);
      }
    }
    return [...map.entries()]
      .filter(([, entry]) => entry.bookings.length > 0 || entry.providers.length > 0)
      .sort((a, b) => b[1].bookings.length - a[1].bookings.length);
  }, [filtered, providers, zones]);

  const liveSharing = providers.filter((provider) => provider.locationStatus === 'live').length;

  return (
    <div className="space-y-5">
      {!mapsConfigured ? (
        <NotConfiguredNotice
          feature="Map tiles"
          detail="MAPS_PROVIDER and MAPS_API_KEY are not set, so the tile map is unavailable. The same operational data is shown below by area — dispatch decisions are made on this."
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { value: 'all', label: `Sab (${bookings.length})` },
            {
              value: 'emergency',
              label: `Emergency (${bookings.filter((b) => b.isEmergency).length})`,
            },
            {
              value: 'unassigned',
              label: `Bina technician (${bookings.filter((b) => b.providerName === null).length})`,
            },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              filter === option.value
                ? 'bg-contrast text-contrast-fg'
                : 'border border-ink-200 text-ink-600 hover:bg-ink-50',
            )}
          >
            {option.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-ink-500">
          {liveSharing} provider(s) sharing live location
        </span>
      </div>

      {byZone.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {byZone.map(([zoneName, entry]) => {
            const uncovered = entry.providers.length === 0 && entry.bookings.length > 0;
            return (
              <section
                key={zoneName}
                className={cn(
                  'rounded-2xl border bg-surface p-4',
                  uncovered ? 'border-alert-300' : 'border-ink-200',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[0.9375rem] font-semibold text-ink-900">{zoneName}</h2>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={entry.bookings.length > 0 ? 'info' : 'neutral'}>
                      {entry.bookings.length} active
                    </Badge>
                    <Badge tone={uncovered ? 'danger' : 'neutral'}>
                      {entry.providers.length} providers
                    </Badge>
                  </div>
                </div>

                {uncovered ? (
                  <p className="mt-2 rounded-lg bg-alert-50 px-2.5 py-1.5 text-xs font-medium text-alert-700">
                    No provider in this area — manual assignment required.
                  </p>
                ) : null}

                {entry.bookings.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {entry.bookings.slice(0, 6).map((booking) => (
                      <li key={booking.id}>
                        <Link
                          href={`/account/bookings/${booking.id}`}
                          className="block rounded-lg bg-ink-50 px-2.5 py-2 hover:bg-ink-100"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-ink-900">
                              {booking.serviceName}
                            </span>
                            {booking.isEmergency ? (
                              <span aria-label="Emergency" className="shrink-0 text-xs">
                                🚨
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                            {booking.status}
                            {booking.scheduledFor
                              ? ` · ${formatDateTime(booking.scheduledFor)}`
                              : ''}
                          </p>
                          <p className="text-[0.6875rem] text-ink-500">
                            {booking.providerName ?? 'No technician assigned'}
                          </p>
                        </Link>
                      </li>
                    ))}
                    {entry.bookings.length > 6 ? (
                      <li className="text-xs text-ink-500">+{entry.bookings.length - 6} aur</li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-ink-500">No active bookings in this area.</p>
                )}

                {entry.providers.length > 0 ? (
                  <div className="mt-3 border-t border-ink-100 pt-2.5">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-500">
                      Providers
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {entry.providers.slice(0, 5).map((provider) => (
                        <li
                          key={provider.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <Link
                            href={`/admin/providers/${provider.id}`}
                            className="truncate text-ink-700 hover:text-brand-700 hover:underline"
                          >
                            {provider.businessName}
                          </Link>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {provider.emergencyAvailable ? (
                              <span title="Emergency available">🚨</span>
                            ) : null}
                            <span className="text-ink-500">{provider.activeJobs} jobs</span>
                            <LocationDot status={provider.locationStatus} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-500">
          No active bookings or provider coverage right now.
        </p>
      )}

      <div className="rounded-xl bg-ink-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Location legend
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-600">
          <li className="flex items-center gap-1.5">
            <LocationDot status="live" /> Live (30 min ke andar ping)
          </li>
          <li className="flex items-center gap-1.5">
            <LocationDot status="stale" /> Stale ping — do not rely on it
          </li>
          <li className="flex items-center gap-1.5">
            <LocationDot status="sharing_off" /> Provider has sharing turned off
          </li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          A provider’s location is recorded only with their permission and is erased automatically
          after 24 hours. A customer’s exact address never appears on this screen.
        </p>
      </div>
    </div>
  );
}

function LocationDot({ status }: { status: 'live' | 'stale' | 'sharing_off' }) {
  const label =
    status === 'live' ? 'Live location' : status === 'stale' ? 'Stale location' : 'Sharing off';
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        status === 'live' && 'bg-brand-500',
        status === 'stale' && 'bg-warn-500',
        status === 'sharing_off' && 'bg-ink-300',
      )}
    />
  );
}
