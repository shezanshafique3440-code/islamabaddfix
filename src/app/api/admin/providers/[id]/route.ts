import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { providerDecisionSchema } from '@/lib/validation/schemas';
import {
  approveProvider,
  reinstateProvider,
  rejectProvider,
  suspendProvider,
} from '@/lib/providers/service';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { fileUrl } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

/**
 * Full provider record for the verification screen — including the private
 * details an admin needs to make the call (documents, masked bank reference).
 */
export const GET = route(async (_request, { params }: Params) => {
  await requirePermission('provider:approve');
  const { id } = await params;

  const provider = await prisma.providerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      },
      verifications: {
        include: { document: { select: { id: true, originalName: true, mimeType: true } } },
      },
      services: {
        include: { service: { select: { name: true, category: { select: { name: true } } } } },
      },
      serviceAreas: { include: { zone: { select: { name: true, slug: true } } } },
      availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      documents: {
        where: { deletedAt: null },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      },
      _count: { select: { bookings: true, reviews: true } },
    },
  });
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found.');

  const { bankIbanHash: _hash, ...safe } = provider;
  return ok({
    ...safe,
    photoUrl: provider.profilePhotoId ? fileUrl(provider.profilePhotoId) : null,
    bankIbanMasked: provider.bankAccountLast4 ? `•••• ${provider.bankAccountLast4}` : null,
  });
});

/** Approve, reject, suspend or reinstate. Each writes an audit entry. */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('provider:approve');
  const { id } = await params;
  const input = await parseJson(request, providerDecisionSchema);

  const actor = { actorUserId: ctx.user.id, actorRole: ctx.role };

  switch (input.action) {
    case 'approve': {
      const provider = await approveProvider({ providerId: id, ...actor, note: input.note });
      return ok({ status: provider.status });
    }
    case 'reject': {
      if (!input.reason) throw new AppError('VALIDATION_ERROR', 'Give a reason for rejecting.');
      const provider = await rejectProvider({ providerId: id, ...actor, reason: input.reason });
      return ok({ status: provider.status });
    }
    case 'suspend': {
      if (!input.reason) throw new AppError('VALIDATION_ERROR', 'Give a reason for suspending.');
      await requirePermission('provider:suspend');
      const provider = await suspendProvider({ providerId: id, ...actor, reason: input.reason });
      return ok({ status: provider.status });
    }
    case 'reinstate': {
      const provider = await reinstateProvider({ providerId: id, ...actor, note: input.note });
      return ok({ status: provider.status });
    }
  }
});
