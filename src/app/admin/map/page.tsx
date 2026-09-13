import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { coarsen, mapsStatus } from '@/lib/maps';
import { ACTIVE_STATUSES } from '@/lib/bookings/state-machine';
import { OpsMap } from '@/components/admin/OpsMap';

export const metadata: Metadata = {
  title: 'Operations map',
  robots: { index: false, follow: false },
};

const LOCATION_FRESHNESS_MS = 30 * 60 * 1000;

/**
 * Operations map.
 *
 * Privacy rules applied server-side, before anything reaches the browser:
 *  - customer locations are coarsened to roughly a 1 km grid
 *  - a provider's position is included only if they enabled sharing AND the
 *    ping is under 30 minutes old; a stale position is worse than none, because
 *    it sends a dispatcher to the wrong place
 *  - providers who have not opted in are represented by their service zones
 */
export default async function AdminMapPage() {
  await requirePermission('analytics:read');

  const [bookings, providers, zones] = await Promise.all([
    prisma.booking.findMany({
      where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
      take: 300,
      select: {
        id: true,
        reference: true,
        status: true,
        isEmergency: true,
        scheduledFor: true,
        service: { select: { name: true } },
        provider: { select: { businessName: true } },
        address: {
          select: {
            latitude: true,
            longitude: true,
            city: true,
            zone: { select: { name: true, latitude: true, longitude: true } },
          },
        },
      },
    }),
    prisma.providerProfile.findMany({
      where: { status: 'VERIFIED', deletedAt: null },
      take: 300,
      select: {
        id: true,
        businessName: true,
        shareLiveLocation: true,
        emergencyAvailable: true,
        locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
        serviceAreas: { select: { zone: { select: { name: true } } } },
        _count: { select: { bookings: { where: { status: { in: [...ACTIVE_STATUSES] } } } } },
      },
    }),
    prisma.serviceZone.findMany({
      where: { isActive: true },
      select: { id: true, name: true, latitude: true, longitude: true },
    }),
  ]);

  const now = Date.now();

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Operations map</h1>
        <p className="mt-1 text-sm text-ink-600">
          Live demand and provider coverage. Customer locations are shown on a roughly 1 km grid —
          never the exact address.
        </p>
      </header>

      <div className="mt-6">
        <OpsMap
          mapsConfigured={mapsStatus().configured}
          bookings={bookings.map((booking) => {
            const exact =
              booking.address.latitude !== null && booking.address.longitude !== null
                ? coarsen({
                    latitude: booking.address.latitude,
                    longitude: booking.address.longitude,
                  })
                : null;
            return {
              id: booking.id,
              reference: booking.reference,
              status: booking.status,
              isEmergency: booking.isEmergency,
              scheduledFor: booking.scheduledFor?.toISOString() ?? null,
              serviceName: booking.service.name,
              providerName: booking.provider?.businessName ?? null,
              zoneName: booking.address.zone?.name ?? booking.address.city,
              hasPreciseArea: exact !== null,
            };
          })}
          providers={providers.map((provider) => {
            const latest = provider.locations[0];
            const fresh =
              latest !== undefined && now - latest.recordedAt.getTime() < LOCATION_FRESHNESS_MS;
            return {
              id: provider.id,
              businessName: provider.businessName,
              emergencyAvailable: provider.emergencyAvailable,
              activeJobs: provider._count.bookings,
              locationStatus: !provider.shareLiveLocation
                ? ('sharing_off' as const)
                : fresh
                  ? ('live' as const)
                  : ('stale' as const),
              zoneNames: provider.serviceAreas.map((area) => area.zone.name),
            };
          })}
          zones={zones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            hasCentroid: zone.latitude !== null && zone.longitude !== null,
          }))}
        />
      </div>
    </div>
  );
}
