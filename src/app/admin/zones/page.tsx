import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { listZones } from '@/lib/catalogue';
import { prisma } from '@/lib/db';
import { ZoneManager } from '@/components/admin/ZoneManager';

export const metadata: Metadata = {
  title: 'Service areas',
  robots: { index: false, follow: false },
};

export default async function AdminZonesPage() {
  await requirePermission('catalogue:write');

  const [zones, coverage, bookingCounts] = await Promise.all([
    listZones({ activeOnly: false }),
    prisma.serviceArea.groupBy({ by: ['zoneId'], _count: { _all: true } }),
    prisma.address.groupBy({ by: ['zoneId'], _count: { _all: true } }),
  ]);

  const providerCount = new Map(coverage.map((row) => [row.zoneId, row._count._all]));
  const addressCount = new Map(bookingCounts.map((row) => [row.zoneId, row._count._all]));

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Service areas</h1>
        <p className="mt-1 text-sm text-ink-600">
          Sectors data hain, code nahi — naya area kholna sirf ek row add karna hai.
        </p>
      </header>

      <div className="mt-6">
        <ZoneManager
          zones={zones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            slug: zone.slug,
            city: zone.city,
            latitude: zone.latitude,
            longitude: zone.longitude,
            isActive: zone.isActive,
            sortOrder: zone.sortOrder,
            providerCount: providerCount.get(zone.id) ?? 0,
            addressCount: addressCount.get(zone.id) ?? 0,
          }))}
        />
      </div>
    </div>
  );
}
