import { created, ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { addressSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';

export const GET = route(async () => {
  const ctx = await requireAuth();
  const addresses = await prisma.address.findMany({
    where: { userId: ctx.user.id, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    include: { zone: { select: { id: true, name: true, slug: true } } },
  });
  return ok(addresses);
});

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  const input = await parseJson(request, addressSchema);

  if (input.zoneId) {
    const zone = await prisma.serviceZone.findFirst({
      where: { id: input.zoneId, isActive: true },
      select: { id: true },
    });
    if (!zone) throw new AppError('VALIDATION_ERROR', 'Yeh service area available nahi hai.');
  }

  const address = await prisma.$transaction(async (tx) => {
    const isFirst =
      (await tx.address.count({ where: { userId: ctx.user.id, deletedAt: null } })) === 0;
    const shouldDefault = input.isDefault || isFirst;

    // A partial unique index enforces one default per user, so demote the old
    // one before promoting this one.
    if (shouldDefault) {
      await tx.address.updateMany({
        where: { userId: ctx.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: {
        userId: ctx.user.id,
        label: input.label,
        zoneId: input.zoneId ?? null,
        city: input.city,
        addressLine: input.addressLine,
        houseOrBuilding: input.houseOrBuilding ?? null,
        landmark: input.landmark ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        contactPhone: input.contactPhone ?? null,
        isDefault: shouldDefault,
      },
      include: { zone: { select: { id: true, name: true, slug: true } } },
    });
  });

  return created(address);
});
