import { created, ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { zoneWriteSchema } from '@/lib/validation/schemas';
import { createZone, listZones } from '@/lib/catalogue';
import { prisma } from '@/lib/db';

export const GET = route(async () => {
  await requirePermission('catalogue:write');
  const zones = await listZones({ activeOnly: false });
  // Provider coverage per zone is the number ops actually cares about when
  // deciding whether to open a new sector.
  const coverage = await prisma.serviceArea.groupBy({
    by: ['zoneId'],
    _count: { _all: true },
  });
  const coverageByZone = new Map(coverage.map((row) => [row.zoneId, row._count._all]));

  return ok(zones.map((zone) => ({ ...zone, providerCount: coverageByZone.get(zone.id) ?? 0 })));
});

export const POST = route(async (request) => {
  const ctx = await requirePermission('catalogue:write');
  const input = await parseJson(request, zoneWriteSchema);
  const zone = await createZone(input, { actorUserId: ctx.user.id, actorRole: ctx.role });
  return created(zone);
});
