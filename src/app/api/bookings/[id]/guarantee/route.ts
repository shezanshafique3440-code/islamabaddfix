import { created, ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { createGuaranteeClaimSchema } from '@/lib/validation/schemas';
import { submitGuaranteeClaim } from '@/lib/bookings/disputes';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStaff } from '@/lib/auth/rbac';

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = await parseJson(request, createGuaranteeClaimSchema);

  const claim = await submitGuaranteeClaim({
    bookingId: id,
    raisedByUserId: ctx.user.id,
    description: input.description,
    fileIds: input.fileIds,
  });

  return created({ id: claim.id, reference: claim.reference, status: claim.status });
});

/** Guarantee state for this booking, including whether a claim is still possible. */
export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      customerId: true,
      providerId: true,
      guaranteeEligible: true,
      guaranteeDays: true,
      guaranteeExpiresAt: true,
      status: true,
      guaranteeClaims: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  const isParty =
    booking.customerId === ctx.user.id ||
    (ctx.providerId !== undefined && booking.providerId === ctx.providerId) ||
    isStaff(ctx.role);
  if (!isParty) throw new AppError('NOT_FOUND', 'Booking not found.');

  const openClaim = booking.guaranteeClaims.find(
    (claim) => claim.status !== 'REJECTED' && claim.status !== 'RESOLVED',
  );

  return ok({
    eligible: booking.guaranteeEligible,
    days: booking.guaranteeDays,
    expiresAt: booking.guaranteeExpiresAt,
    isActive:
      booking.guaranteeEligible &&
      booking.guaranteeExpiresAt !== null &&
      booking.guaranteeExpiresAt > new Date(),
    canClaim:
      booking.status === 'COMPLETED' &&
      booking.guaranteeEligible &&
      booking.guaranteeExpiresAt !== null &&
      booking.guaranteeExpiresAt > new Date() &&
      openClaim === undefined,
    claims: booking.guaranteeClaims,
  });
});
