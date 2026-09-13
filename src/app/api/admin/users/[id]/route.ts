import { ok, parseJson, route } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/auth/session';
import { changeRoleSchema, setUserActiveSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';
import { revokeAllSessions } from '@/lib/auth/service';

type Params = { params: Promise<{ id: string }> };

/**
 * Change a user's role. SUPER_ADMIN only, and never on your own account —
 * self-demotion is how an operator locks themselves out of their own platform,
 * and self-promotion is a privilege-escalation path.
 */
export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('user:role:write');
  const { id } = await params;
  const input = await parseJson(request, changeRoleSchema);

  if (id === ctx.user.id) {
    throw new AppError('FORBIDDEN', 'You cannot change your own role.');
  }

  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true, email: true, providerProfile: { select: { id: true } } },
  });
  if (!target) throw new AppError('NOT_FOUND', 'User not found.');

  // Moving someone to PROVIDER without a profile leaves them unable to work;
  // they must complete onboarding, which the role change permits.
  const user = await prisma.user.update({
    where: { id },
    data: { role: input.role },
    select: { id: true, role: true, fullName: true, email: true },
  });

  // A role change invalidates every access token's role claim.
  await revokeAllSessions(id);

  await recordAudit({
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entity: 'User',
    entityId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { from: target.role, to: input.role, reason: input.reason },
  });

  return ok({ user, sessionsRevoked: true });
});

/** Enable or disable an account. Disabling revokes all sessions. */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireAuth();
  await requirePermission('provider:suspend');
  const { id } = await params;
  const input = await parseJson(request, setUserActiveSchema);

  if (id === ctx.user.id) {
    throw new AppError('FORBIDDEN', 'You cannot disable your own account.');
  }

  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!target) throw new AppError('NOT_FOUND', 'User not found.');

  // Only a SUPER_ADMIN may disable another staff account.
  if ((target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') && ctx.role !== 'SUPER_ADMIN') {
    throw new AppError('FORBIDDEN', 'Only a super admin can disable an admin account.');
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: input.isActive },
    select: { id: true, isActive: true, fullName: true },
  });
  if (!input.isActive) await revokeAllSessions(id);

  await recordAudit({
    action: AUDIT_ACTIONS.USER_DISABLED,
    entity: 'User',
    entityId: id,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { isActive: input.isActive, reason: input.reason },
  });

  return ok({ user });
});
