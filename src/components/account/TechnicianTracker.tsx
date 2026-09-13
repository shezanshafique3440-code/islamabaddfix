'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Badge } from '@/components/ui/Badge';
import { NotConfiguredNotice } from '@/components/ui/EmptyState';
import { plural } from '@/lib/utils';

interface Snapshot {
  state: 'not_trackable' | 'sharing_off' | 'no_fix' | 'stale' | 'live';
  point: { latitude: number; longitude: number } | null;
  destination: { latitude: number; longitude: number } | null;
  distanceKm: number | null;
  distanceIsEstimate: boolean;
  roughMinutesAway: number | null;
  recordedAt: string | null;
  ageSeconds: number | null;
  mapsConfigured: boolean;
  message: string;
}

const POLL_MS = 30_000;

/**
 * Live position of the technician on the way to this booking.
 *
 * Every state it can be in is shown plainly, including the three that are not
 * "here they are": the technician has sharing off, their phone has not reported
 * yet, or the last fix is old. A tracker that silently shows nothing in those
 * cases teaches people it is broken.
 *
 * Polls rather than streams: one request every thirty seconds costs almost
 * nothing and needs no socket infrastructure to keep alive on a phone that is
 * locked in someone's pocket.
 */
export function TechnicianTracker({
  bookingId,
  technicianName,
}: {
  bookingId: string;
  technicianName: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setSnapshot(await api.get<Snapshot>(`/api/bookings/${bookingId}/tracking`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not get an update.');
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => void load(), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  if (!snapshot) {
    return (
      <p className="text-sm text-ink-500" role="status">
        {error ?? 'Checking…'}
      </p>
    );
  }

  if (snapshot.state === 'not_trackable') return null;

  const positioned = snapshot.state === 'live' || snapshot.state === 'stale';

  return (
    <div className="rounded-2xl border border-ink-200 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Where {technicianName} is</h2>
        <Badge tone={snapshot.state === 'live' ? 'success' : 'warn'}>
          {snapshot.state === 'live'
            ? 'Live'
            : snapshot.state === 'stale'
              ? 'Last known'
              : 'No position'}
        </Badge>
      </div>

      {positioned ? (
        <>
          <p className="mt-3 text-2xl font-bold tracking-tight text-ink-950">
            {snapshot.distanceKm !== null
              ? `${snapshot.distanceIsEstimate ? 'about ' : ''}${snapshot.distanceKm} km away`
              : 'On the move'}
          </p>
          {snapshot.roughMinutesAway !== null ? (
            <p className="mt-1 text-sm text-ink-600">
              Roughly {plural(snapshot.roughMinutesAway, 'minute')} at city speed. This is worked
              out from distance alone — not traffic, not a route — so treat it as a rough idea.
            </p>
          ) : null}
        </>
      ) : null}

      <p className="mt-3 text-sm leading-relaxed text-ink-600">{snapshot.message}</p>

      {positioned && snapshot.ageSeconds !== null ? (
        <p className="mt-1 text-xs text-ink-500">
          Updated{' '}
          {snapshot.ageSeconds < 60
            ? 'just now'
            : `${plural(Math.round(snapshot.ageSeconds / 60), 'minute')} ago`}
          . Refreshes every {POLL_MS / 1000} seconds.
        </p>
      ) : null}

      {positioned && !snapshot.mapsConfigured ? (
        <NotConfiguredNotice
          className="mt-4"
          feature="Map tiles"
          detail="MAPS_PROVIDER and MAPS_API_KEY are not set, so there is no map to draw. The distance above is the same figure a map would be drawn from."
        />
      ) : null}

      {positioned && snapshot.mapsConfigured && snapshot.point ? (
        <a
          href={`https://www.google.com/maps?q=${snapshot.point.latitude},${snapshot.point.longitude}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
        >
          Open the last position in maps
        </a>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-warn-700" role="status">
          {error} Still trying.
        </p>
      ) : null}
    </div>
  );
}
