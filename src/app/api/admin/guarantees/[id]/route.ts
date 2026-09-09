import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { decideGuaranteeClaimSchema } from '@/lib/validation/schemas';
import { decideGuaranteeClaim } from '@/lib/bookings/disputes';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { fileUrl } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request, { params }: Params) => {
  await requirePermission('guarantee:decide');
  const { id } = await params;

  const claim = await prisma.guaranteeClaim.findUnique({
    where: { id },
    include: {
      files: {
        where: { deletedAt: null },
        select: { id: true, originalName: true, mimeType: true },
      },
      booking: {
        include: {
          service: { select: { name: true, guaranteeEligible: true } },
          customer: { select: { id: true, fullName: true, phone: true } },
          provider: { select: { id: true, businessName: true, contactPhone: true } },
          address: { include: { zone: { select: { name: true } } } },
          files: {
            where: { deletedAt: null },
            select: { id: true, originalName: true, mimeType: true, isCompletionProof: true },
          },
          review: { select: { rating: true, comment: true } },
        },
      },
    },
  });
  if (!claim) throw new AppError('NOT_FOUND', 'Claim nahi mila.');

  return ok({
    ...claim,
    files: claim.files.map((file) => ({ ...file, url: fileUrl(file.id) })),
    booking: {
      ...claim.booking,
      files: claim.booking.files.map((file) => ({ ...file, url: fileUrl(file.id) })),
    },
  });
});

export const POST = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('guarantee:decide');
  const { id } = await params;
  const input = await parseJson(request, decideGuaranteeClaimSchema);

  if (input.status === 'REVISIT_SCHEDULED' && !input.revisitScheduledFor) {
    throw new AppError('VALIDATION_ERROR', 'Re-visit ke liye date aur time chunein.');
  }

  const claim = await decideGuaranteeClaim({
    claimId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    status: input.status,
    notes: input.notes,
    revisitScheduledFor: input.revisitScheduledFor ?? null,
    providerResponsible: input.providerResponsible,
  });

  return ok({
    status: claim.status,
    revisitScheduledFor: claim.revisitScheduledFor,
    providerResponsible: claim.providerResponsible,
  });
});
