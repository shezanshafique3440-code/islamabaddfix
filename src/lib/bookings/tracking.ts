import type { BookingStatus } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { estimateDistanceKm, mapsStatus, type LatLng } from '../maps';

/**
 * Live technician tracking, for the window where it is actually useful.
 *
 * Three things keep this from being surveillance:
 *
 *  1. **The provider consents.** Nothing is recorded unless they turned sharing
 *     on, and turning it off erases the trail. That is enforced on the write
 *     path; this module only reads what they agreed to share.
 *  2. **The window is narrow.** A customer can see a position only while a
 *     technician is on the way to or at *their* booking. Not before it is
 *     accepted, not after the job is done.
 *  3. **A stale ping is not a position.** A fix older than the freshness window
 *     is reported as stale rather than drawn on a map as if it were current.
 *     Showing a technician "two streets away" when the phone last spoke twenty
 *     minutes ago is worse than showing nothing.
 */

/** Only these statuses mean a technician is actually travelling or on site. */
const TRACKABLE_STATUSES: readonly BookingStatus[] = ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'];

/** A fix older than this is reported, but never presented as current. */
const FRESHNESS_SECONDS = 5 * 60;

export type TrackingState = 'not_trackable' | 'sharing_off' | 'no_fix' | 'stale' | 'live';

export interface TrackingSnapshot {
  state: TrackingState;
  /** Present only for 'live' and 'stale'. */
  point: LatLng | null;
  destination: LatLng | null;
  distanceKm: number | null;
  distanceIsEstimate: boolean;
  /** Rough minutes away, from distance alone — never sold as a real ETA. */
  roughMinutesAway: number | null;
  recordedAt: Date | null;
  ageSeconds: number | null;
  /** Whether a tile map can be drawn at all on this deployment. */
  mapsConfigured: boolean;
  /** One sentence the UI can show verbatim. */
  message: string;
}

/**
 * Average city speed used to turn distance into a rough number of minutes.
 *
 * Deliberately pessimistic and deliberately labelled "roughly": we have no
 * routing engine, no traffic feed and no idea what the technician is riding.
 * A number dressed up as an ETA that is wrong by fifteen minutes costs more
 * trust than an honest "roughly 20 minutes away".
 */
const CITY_SPEED_KMH = 18;

const MESSAGES: Record<TrackingState, string> = {
  not_trackable: 'Tracking appears once the technician is on the way.',
  sharing_off: 'This technician has location sharing turned off, so there is nothing to show.',
  no_fix: 'The technician has sharing on, but their phone has not reported a position yet.',
  stale: 'The last position is a few minutes old, so treat it as approximate.',
  live: 'Position updated in the last few minutes.',
};

/**
 * Where the technician is, as far as we honestly know.
 *
 * Authorisation is part of the query: the booking must belong to the caller.
 * This is the check that stops one customer watching another's technician.
 */
export async function trackingFor(params: {
  bookingId: string;
  customerId: string;
}): Promise<TrackingSnapshot> {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, customerId: params.customerId, deletedAt: null },
    select: {
      status: true,
      address: { select: { latitude: true, longitude: true } },
      provider: {
        select: {
          shareLiveLocation: true,
          locations: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { latitude: true, longitude: true, recordedAt: true },
          },
        },
      },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');

  const destination: LatLng | null =
    booking.address.latitude != null && booking.address.longitude != null
      ? { latitude: booking.address.latitude, longitude: booking.address.longitude }
      : null;

  const base = {
    point: null,
    destination,
    distanceKm: null,
    distanceIsEstimate: false,
    roughMinutesAway: null,
    recordedAt: null,
    ageSeconds: null,
    mapsConfigured: mapsStatus().configured,
  };

  if (!TRACKABLE_STATUSES.includes(booking.status) || !booking.provider) {
    return { ...base, state: 'not_trackable', message: MESSAGES.not_trackable };
  }
  if (!booking.provider.shareLiveLocation) {
    return { ...base, state: 'sharing_off', message: MESSAGES.sharing_off };
  }

  const fix = booking.provider.locations[0];
  if (!fix) {
    return { ...base, state: 'no_fix', message: MESSAGES.no_fix };
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - fix.recordedAt.getTime()) / 1000));
  const state: TrackingState = ageSeconds > FRESHNESS_SECONDS ? 'stale' : 'live';
  const point = { latitude: fix.latitude, longitude: fix.longitude };
  const { km, isEstimate } = estimateDistanceKm(destination, point);

  return {
    ...base,
    state,
    point,
    distanceKm: destination ? Math.round(km * 10) / 10 : null,
    distanceIsEstimate: isEstimate,
    roughMinutesAway:
      destination && !isEstimate ? Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60)) : null,
    recordedAt: fix.recordedAt,
    ageSeconds,
    message: MESSAGES[state],
  };
}
