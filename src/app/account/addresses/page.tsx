import type { Metadata } from 'next';
import { requirePageRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { listZones } from '@/lib/catalogue';
import { AddressManager } from '@/components/account/AddressManager';

export const metadata: Metadata = { title: 'Addresses', robots: { index: false, follow: false } };

export default async function AddressesPage() {
  const ctx = await requirePageRole(['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'], '/account/addresses');

  const [addresses, zones] = await Promise.all([
    prisma.address.findMany({
      where: { userId: ctx.user.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { zone: { select: { id: true, name: true } } },
    }),
    listZones({ activeOnly: true }),
  ]);

  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Saved addresses</h1>
      <p className="mt-1 text-sm text-ink-600">
        You can pick these addresses instantly while booking.
      </p>
      <div className="mt-6">
        <AddressManager
          addresses={addresses.map((address) => ({
            id: address.id,
            label: address.label,
            addressLine: address.addressLine,
            houseOrBuilding: address.houseOrBuilding,
            landmark: address.landmark,
            contactPhone: address.contactPhone,
            zoneId: address.zoneId,
            zoneName: address.zone?.name ?? null,
            city: address.city,
            isDefault: address.isDefault,
            hasCoordinates: address.latitude !== null && address.longitude !== null,
          }))}
          zones={zones.map((zone) => ({ id: zone.id, name: zone.name }))}
        />
      </div>
    </div>
  );
}
