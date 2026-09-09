import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { verificationUpdateSchema } from '@/lib/validation/schemas';
import { setVerification } from '@/lib/providers/service';

type Params = { params: Promise<{ id: string }> };

/**
 * Set one verification badge.
 *
 * Granular on purpose: approving the identity check must not silently imply a
 * background check, a licence or insurance, none of which this platform does.
 */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('provider:approve');
  const { id } = await params;
  const input = await parseJson(request, verificationUpdateSchema);

  await setVerification({
    providerId: id,
    kind: input.kind,
    status: input.status,
    notes: input.notes,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
  });

  return ok({ updated: true, kind: input.kind, status: input.status });
});
