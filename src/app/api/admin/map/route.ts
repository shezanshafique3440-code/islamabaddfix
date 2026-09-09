import { ok, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { coarsen, mapsStatus } from '@/lib/maps';
import { ACTIVE_STATUSES } from '@/lib/bookings/state-machine';

/**
 * Operations map data.
 *
 * Privacy rules applied here, not in the client:
 *  - Customer addresses are coarsened to roughly a 1 km grid. Ops needs to see
 *    where demand is, not which house.
 *  - A provider's live position is included ONLY if they enabled
 *    `shareLiveLocation`, and only from a ping in the last 30 minutes. Stale
 *    positions are worse than none — they send technicians to the wrong place.
 *  - Providers who have not opted in are represented by their service zones.
 */
const LOCATION_FRESHNESS_MS = 30 * 60 * 1000;

export const GET = route(async () => {
  await requirePermission('analytics:read');

  const [bookings, providers, zones] = await Promise.all([
    prisma.booking.findMany({
      where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
      select: {
        id: true,
        reference: true,
        status: true,
        isEmergency: true,
        urgency: true,
        scheduledFor: true,
        service: { select: { name: true } },
        provider: { select: { id: true, businessName: true } },
        address: {
          select: {
            latitude: true,
            longitude: true,
            city: true,
            zone: { select: { name: true, latitude: true, longitude: true } },
          },
        },
      },
      take: 500,
    }),
    prisma.providerProfile.findMany({
      where: { status: 'VERIFIED', deletedAt: null },
      select: {
        id: true,
        businessName: true,
        shareLiveLocation: true,
        emergencyAvailable: true,
        serviceRadiusKm: true,
        locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
        serviceAreas: {
          select: { zone: { select: { name: true, latitude: true, longitude: true } } },
        },
        _count: { select: { bookings: { where: { status: { in: [...ACTIVE_STATUSES] } } } } },
      },
      take: 500,
    }),
    prisma.serviceZone.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, latitude: true, longitude: true },
    }),
  ]);

  const now = Date.now();

  return ok({
    maps: mapsStatus(),
    bookings: bookings.map((booking) => {
      const exact =
        booking.address.latitude != null && booking.address.longitude != null
          ? { latitude: booking.address.latitude, longitude: booking.address.longitude }
          : null;
      const zoneCentroid =
        booking.address.zone?.latitude != null && booking.address.zone.longitude != null
          ? { latitude: booking.address.zone.latitude, longitude: booking.address.zone.longitude }
          : null;
      // Coarsened, never the exact pin.
      const point = exact ? coarsen(exact) : zoneCentroid;
      return {
        id: booking.id,
        reference: booking.reference,
        status: booking.status,
        isEmergency: booking.isEmergency,
        urgency: booking.urgency,
        scheduledFor: booking.scheduledFor,
        serviceName: booking.service.name,
        providerName: booking.provider?.businessName ?? null,
        zoneName: booking.address.zone?.name ?? booking.address.city,
        approximateLocation: point,
        locationPrecision: exact ? 'approximate' : zoneCentroid ? 'zone' : 'unknown',
      };
    }),
    providers: providers.map((provider) => {
      const latest = provider.locations[0];
      const isFresh =
        latest !== undefined && now - latest.recordedAt.getTime() < LOCATION_FRESHNESS_MS;
      const shareable = provider.shareLiveLocation && isFresh && latest !== undefined;
      return {
        id: provider.id,
        businessName: provider.businessName,
        emergencyAvailable: provider.emergencyAvailable,
        activeJobs: provider._count.bookings,
        serviceRadiusKm: provider.serviceRadiusKm,
        sharesLocation: provider.shareLiveLocation,
        // Absent unless the provider consented and the ping is recent.
        liveLocation: shareable
          ? { latitude: latest.latitude, longitude: latest.longitude, recordedAt: latest.recordedAt }
          : null,
        locationStatus: !provider.shareLiveLocation
          ? 'sharing_off'
          : isFresh
            ? 'live'
            : 'stale',
        zones: provider.serviceAreas
          .map((area) => area.zone)
          .filter((zone) => zone.latitude != null && zone.longitude != null),
      };
    }),
    zones,
  });
});
