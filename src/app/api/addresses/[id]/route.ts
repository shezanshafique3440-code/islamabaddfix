import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { addressSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';

type Params = { params: Promise<{ id: string }> };

/** Ownership check shared by both handlers below. */
async function ownedAddress(userId: string, id: string) {
  const address = await prisma.address.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!address) throw new AppError('NOT_FOUND', 'Address nahi mila.');
  return address;
}

export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await ownedAddress(ctx.user.id, id);
  const input = await parseJson(request, addressSchema.partial());

  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId: ctx.user.id, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.zoneId !== undefined ? { zoneId: input.zoneId } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
        ...(input.houseOrBuilding !== undefined
          ? { houseOrBuilding: input.houseOrBuilding ?? null }
          : {}),
        ...(input.landmark !== undefined ? { landmark: input.landmark ?? null } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone ?? null } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
      include: { zone: { select: { id: true, name: true, slug: true } } },
    });
  });

  return ok(address);
});

/**
 * Soft delete. Bookings reference addresses and their history must stay
 * readable, so the row is retained and hidden from the customer's list.
 */
export const DELETE = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await ownedAddress(ctx.user.id, id);

  const liveBookings = await prisma.booking.count({
    where: {
      addressId: id,
      status: {
        in: [
          'PENDING',
          'PROVIDER_NOTIFIED',
          'ACCEPTED',
          'QUOTE_PENDING',
          'QUOTE_APPROVED',
          'SCHEDULED',
          'ON_THE_WAY',
          'ARRIVED',
          'IN_PROGRESS',
        ],
      },
    },
  });
  if (liveBookings > 0) {
    throw new AppError(
      'CONFLICT',
      'Is address par live booking hai. Pehle woh mukammal ya cancel karein.',
    );
  }

  await prisma.address.update({
    where: { id },
    data: { deletedAt: new Date(), isDefault: false },
  });
  return ok({ deleted: true });
});
