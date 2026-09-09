import { ok, route } from '@/lib/http';
import { listZones } from '@/lib/catalogue';

export const GET = route(async () => {
  const zones = await listZones({ activeOnly: true });
  return ok(
    zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      slug: zone.slug,
      city: zone.city,
      // Centroids are coarse by nature; they are used for distance estimates.
      latitude: zone.latitude,
      longitude: zone.longitude,
    })),
  );
});
