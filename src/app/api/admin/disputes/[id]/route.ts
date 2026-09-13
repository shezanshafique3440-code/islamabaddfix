import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { resolveDisputeSchema } from '@/lib/validation/schemas';
import { resolveDispute } from '@/lib/bookings/disputes';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { rupeesToPaisa } from '@/lib/money';
import { fileUrl } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

/** Everything an admin needs to arbitrate: evidence, quotes, payments, thread. */
export const GET = route(async (_request, { params }: Params) => {
  await requirePermission('dispute:resolve');
  const { id } = await params;

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      files: {
        where: { deletedAt: null },
        select: { id: true, originalName: true, mimeType: true, createdAt: true },
      },
      booking: {
        include: {
          service: { select: { name: true, category: { select: { name: true } } } },
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          provider: { select: { id: true, businessName: true, contactPhone: true, userId: true } },
          address: { include: { zone: { select: { name: true } } } },
          quotes: { include: { items: true }, orderBy: { createdAt: 'desc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
          files: {
            where: { deletedAt: null },
            select: { id: true, originalName: true, mimeType: true, isCompletionProof: true },
          },
          review: true,
        },
      },
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, fullName: true, role: true } } },
          },
        },
      },
    },
  });
  if (!dispute) throw new AppError('NOT_FOUND', 'Dispute not found.');

  return ok({
    ...dispute,
    files: dispute.files.map((file) => ({ ...file, url: fileUrl(file.id) })),
    booking: {
      ...dispute.booking,
      files: dispute.booking.files.map((file) => ({ ...file, url: fileUrl(file.id) })),
    },
  });
});

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('dispute:resolve');
  const { id } = await params;
  const input = await parseJson(request, resolveDisputeSchema);

  if (input.status === 'RESOLVED_PARTIAL_REFUND' && input.refundRupees === undefined) {
    throw new AppError('VALIDATION_ERROR', 'Enter an amount for a partial refund.');
  }
  if (input.status === 'RESOLVED_REFUND' || input.status === 'RESOLVED_PARTIAL_REFUND') {
    await requirePermission('payment:refund');
  }

  const result = await resolveDispute({
    disputeId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    status: input.status,
    notes: input.notes,
    refundPaisa: input.refundRupees !== undefined ? rupeesToPaisa(input.refundRupees) : undefined,
  });

  return ok({
    status: result.dispute.status,
    refundPaisa: result.dispute.refundPaisa,
    // Cash and bank refunds are executed by hand; say so rather than implying
    // the money already moved.
    refundInstructions: result.refundInstructions ?? null,
  });
});
