import { created, ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { createDisputeSchema } from '@/lib/validation/schemas';
import { openDispute } from '@/lib/bookings/disputes';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStaff } from '@/lib/auth/rbac';

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = await parseJson(request, createDisputeSchema);

  const dispute = await openDispute({
    bookingId: id,
    raisedByUserId: ctx.user.id,
    reason: input.reason,
    description: input.description,
    fileIds: input.fileIds,
  });

  return created({
    id: dispute.id,
    reference: dispute.reference,
    status: dispute.status,
  });
});

export const GET = route(async (_request, { params }: Params) => {
  const ctx = await requireAuth();
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { customerId: true, providerId: true },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking nahi mili.');
  const isParty =
    booking.customerId === ctx.user.id ||
    (ctx.providerId !== undefined && booking.providerId === ctx.providerId) ||
    isStaff(ctx.role);
  if (!isParty) throw new AppError('NOT_FOUND', 'Booking nahi mili.');

  const disputes = await prisma.dispute.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      files: {
        where: { deletedAt: null },
        select: { id: true, mimeType: true, originalName: true },
      },
    },
  });
  return ok(disputes);
});
