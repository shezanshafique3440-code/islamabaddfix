import type { BookingUrgency } from '@prisma/client';
import { prisma } from '../db';
import { getSetting } from '../settings';
import { estimateDistanceKm, type LatLng } from '../maps';
import { WORKLOAD_STATUSES } from '../bookings/state-machine';

/**
 * Provider matching.
 *
 * Two stages, deliberately separated:
 *
 *  HARD FILTERS (SQL) — non-negotiable eligibility. A provider who fails any of
 *  these is not a candidate at any score: not verified, suspended, soft-deleted,
 *  does not offer the service, does not cover the zone, at capacity, or (for an
 *  emergency job) not available for emergencies.
 *
 *  SOFT SCORING (in memory) — ranks the survivors. Every weight comes from the
 *  `matching.weights` setting, so operations can retune ranking from the admin
 *  panel without a deploy. Each signal is normalised to 0-1 before weighting,
 *  which is what makes the weights comparable to each other.
 */

export interface MatchCandidate {
  providerId: string;
  userId: string;
  businessName: string;
  slug: string;
  headline: string | null;
  profilePhotoId: string | null;
  yearsExperience: number;
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  responseRate: number;
  avgResponseMinutes: number | null;
  emergencyAvailable: boolean;
  emergencyFeePaisa: number;
  startingPricePaisa: number;
  verifiedIdentity: boolean;
  verifiedPhone: boolean;
  distanceKm: number;
  distanceIsEstimate: boolean;
  activeJobs: number;
  score: number;
  /** Per-signal contribution, for tuning and for the admin match inspector. */
  breakdown: Record<string, number>;
}

export interface MatchQuery {
  serviceId: string;
  zoneId?: string | null;
  location?: LatLng | null;
  scheduledFor?: Date | null;
  urgency?: BookingUrgency;
  limit?: number;
}

/** Providers eligible for a job, best first. */
export async function findMatchingProviders(query: MatchQuery): Promise<MatchCandidate[]> {
  const [weights, maxDistanceKm, ratingFloor] = await Promise.all([
    getSetting('matching.weights'),
    getSetting('matching.maxDistanceKm'),
    getSetting('matching.newProviderRatingFloor'),
  ]);

  const isEmergency = query.urgency === 'EMERGENCY';

  // ---- hard filters --------------------------------------------------------
  const rows = await prisma.providerService.findMany({
    where: {
      serviceId: query.serviceId,
      isEnabled: true,
      provider: {
        status: 'VERIFIED',
        deletedAt: null,
        user: { isActive: true, deletedAt: null },
        ...(isEmergency ? { emergencyAvailable: true } : {}),
        ...(query.zoneId ? { serviceAreas: { some: { zoneId: query.zoneId } } } : {}),
      },
    },
    select: {
      startingPricePaisa: true,
      provider: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          slug: true,
          headline: true,
          profilePhotoId: true,
          yearsExperience: true,
          ratingAverage: true,
          ratingCount: true,
          completedJobs: true,
          responseRate: true,
          offeredJobs: true,
          avgResponseMinutes: true,
          emergencyAvailable: true,
          emergencyFeePaisa: true,
          serviceRadiusKm: true,
          maxActiveJobs: true,
          verifications: {
            where: { status: 'APPROVED' },
            select: { kind: true },
          },
          availability: {
            where: { isEnabled: true },
            select: { dayOfWeek: true, startMinute: true, endMinute: true },
          },
          locations: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { latitude: true, longitude: true },
          },
          bookings: {
            where: { status: { in: [...WORKLOAD_STATUSES] } },
            select: { id: true, scheduledFor: true },
          },
        },
      },
    },
  });

  // Zone centroid backs up distance when neither party has a GPS fix.
  const zoneCentroid = query.zoneId
    ? await prisma.serviceZone.findUnique({
        where: { id: query.zoneId },
        select: { latitude: true, longitude: true },
      })
    : null;

  const jobLocation: LatLng | null =
    query.location ??
    (zoneCentroid?.latitude != null && zoneCentroid.longitude != null
      ? { latitude: zoneCentroid.latitude, longitude: zoneCentroid.longitude }
      : null);

  const candidates: MatchCandidate[] = [];

  for (const row of rows) {
    const provider = row.provider;
    const activeJobs = provider.bookings.length;

    // Capacity is a hard filter, but it cannot be expressed in the query above.
    if (activeJobs >= provider.maxActiveJobs) continue;

    const providerLocation = provider.locations[0]
      ? { latitude: provider.locations[0].latitude, longitude: provider.locations[0].longitude }
      : null;
    const { km, isEstimate } = estimateDistanceKm(jobLocation, providerLocation);

    // Respect both the platform ceiling and the provider's own stated radius.
    // An estimated distance is not grounds for exclusion — we know too little.
    if (!isEstimate && (km > maxDistanceKm || km > provider.serviceRadiusKm)) continue;

    const approvedKinds = new Set(provider.verifications.map((v) => v.kind));

    const signals = {
      // Reaching this point means the provider offers the service and covers the
      // area, so serviceMatch is 1. It stays a weighted signal because partial
      // matching (adjacent zones, related services) is the natural extension.
      serviceMatch: 1,
      availability: availabilityScore(provider.availability, query.scheduledFor, isEmergency),
      rating: ratingScore(provider.ratingAverage, provider.ratingCount, ratingFloor),
      // Nearer is better; an unknown distance is scored as mid-range, not best.
      distance: isEstimate ? 0.5 : Math.max(0, 1 - km / maxDistanceKm),
      // A provider who has never been offered a job has no track record; score
      // them neutrally rather than punishing them for being new.
      responseRate: provider.offeredJobs === 0 ? 0.5 : provider.responseRate,
      // Log scale: the gap between 5 and 50 jobs should matter more than 500 vs 545.
      completedJobs: Math.min(1, Math.log10(provider.completedJobs + 1) / 2.5),
      // Lighter current load ranks higher, so work spreads across the network.
      workload: 1 - activeJobs / provider.maxActiveJobs,
    };

    const breakdown: Record<string, number> = {};
    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const signal = signals[key as keyof typeof signals] ?? 0;
      const contribution = signal * weight;
      breakdown[key] = Math.round(contribution * 100) / 100;
      score += contribution;
    }

    candidates.push({
      providerId: provider.id,
      userId: provider.userId,
      businessName: provider.businessName,
      slug: provider.slug,
      headline: provider.headline,
      profilePhotoId: provider.profilePhotoId,
      yearsExperience: provider.yearsExperience,
      ratingAverage: provider.ratingAverage,
      ratingCount: provider.ratingCount,
      completedJobs: provider.completedJobs,
      responseRate: provider.responseRate,
      avgResponseMinutes: provider.avgResponseMinutes,
      emergencyAvailable: provider.emergencyAvailable,
      emergencyFeePaisa: provider.emergencyFeePaisa,
      startingPricePaisa: row.startingPricePaisa,
      verifiedIdentity: approvedKinds.has('IDENTITY_CNIC'),
      verifiedPhone: approvedKinds.has('PHONE'),
      distanceKm: Math.round(km * 10) / 10,
      distanceIsEstimate: isEstimate,
      activeJobs,
      score: Math.round(score * 100) / 100,
      breakdown,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, query.limit ?? 20);
}

/**
 * Does the provider's weekly schedule cover the requested slot?
 *
 * Emergencies ignore the schedule — an emergency-available provider has already
 * opted into being called outside hours. With no requested time we return a
 * neutral 0.6 rather than 0, since an unknown slot is not evidence against them.
 */
function availabilityScore(
  windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
  scheduledFor: Date | null | undefined,
  isEmergency: boolean,
): number {
  if (isEmergency) return 1;
  if (windows.length === 0) return 0.4; // no schedule set: reachable but unconfirmed
  if (!scheduledFor) return 0.6;

  // Compare in Pakistan Standard Time (UTC+5, no DST), which is what providers
  // set their hours in.
  const pkt = new Date(scheduledFor.getTime() + 5 * 60 * 60 * 1000);
  const day = pkt.getUTCDay();
  const minute = pkt.getUTCHours() * 60 + pkt.getUTCMinutes();

  const covering = windows.some(
    (w) => w.dayOfWeek === day && minute >= w.startMinute && minute < w.endMinute,
  );
  if (covering) return 1;

  // Available that day but at a different hour — worth ranking above a provider
  // who does not work that day at all, since slots are often negotiable.
  const sameDay = windows.some((w) => w.dayOfWeek === day);
  return sameDay ? 0.35 : 0.1;
}

/**
 * Rating, normalised to 0-1, credited with the configured floor while a
 * provider has no reviews so new joiners can win their first jobs. Confidence
 * ramps in over the first ten reviews.
 */
function ratingScore(
  average: number | null,
  count: number,
  floor: number,
): number {
  if (average === null || count === 0) return floor / 5;
  const confidence = Math.min(1, count / 10);
  const blended = average * confidence + floor * (1 - confidence);
  return Math.min(1, blended / 5);
}

/**
 * Fan a booking out to the top-ranked providers and record each offer.
 * Returns the providers actually offered the job.
 */
export async function createOffers(params: {
  bookingId: string;
  candidates: MatchCandidate[];
  limit: number;
  expiryMinutes: number;
}): Promise<MatchCandidate[]> {
  const chosen = params.candidates.slice(0, params.limit);
  if (chosen.length === 0) return [];

  const expiresAt = new Date(Date.now() + params.expiryMinutes * 60_000);
  await prisma.$transaction([
    prisma.bookingOffer.createMany({
      data: chosen.map((candidate) => ({
        bookingId: params.bookingId,
        providerId: candidate.providerId,
        score: candidate.score,
        expiresAt,
      })),
      skipDuplicates: true,
    }),
    // Offer counters feed the response-rate signal above.
    prisma.providerProfile.updateMany({
      where: { id: { in: chosen.map((c) => c.providerId) } },
      data: { offeredJobs: { increment: 1 } },
    }),
  ]);

  return chosen;
}

/**
 * Recompute a provider's response-rate and average response time from their
 * offer history. Called when they accept or decline.
 */
export async function recordOfferResponse(params: {
  bookingId: string;
  providerId: string;
  accepted: boolean;
  declineReason?: string;
}): Promise<void> {
  const offer = await prisma.bookingOffer.findUnique({
    where: { bookingId_providerId: { bookingId: params.bookingId, providerId: params.providerId } },
  });

  const now = new Date();
  if (offer && offer.respondedAt === null) {
    await prisma.bookingOffer.update({
      where: { id: offer.id },
      data: {
        respondedAt: now,
        accepted: params.accepted,
        declineReason: params.declineReason ?? null,
      },
    });
  }

  const [responded, total, accepted] = await Promise.all([
    prisma.bookingOffer.findMany({
      where: { providerId: params.providerId, respondedAt: { not: null } },
      select: { notifiedAt: true, respondedAt: true },
      orderBy: { notifiedAt: 'desc' },
      take: 50,
    }),
    prisma.bookingOffer.count({ where: { providerId: params.providerId } }),
    prisma.bookingOffer.count({ where: { providerId: params.providerId, accepted: true } }),
  ]);

  const avgResponseMinutes =
    responded.length > 0
      ? Math.round(
          responded.reduce(
            (sum, offerRow) =>
              sum + (offerRow.respondedAt!.getTime() - offerRow.notifiedAt.getTime()) / 60_000,
            0,
          ) / responded.length,
        )
      : null;

  await prisma.providerProfile.update({
    where: { id: params.providerId },
    data: {
      acceptedJobs: accepted,
      // Share of offers answered at all — a proxy for reliability, not for
      // eagerness to take every job.
      responseRate: total === 0 ? 0 : Math.min(1, responded.length / total),
      avgResponseMinutes,
    },
  });
}
