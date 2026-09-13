import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { readAuthCookies } from './cookies';
import { verifyAccessToken } from './tokens';
import { assertCan, type Permission } from './rbac';
import { toSafeUser, type SafeUser } from './service';

/**
 * Server-side identity resolution.
 *
 * The access token is only a hint: every call re-reads the user row so that a
 * suspension, role change or deletion takes effect immediately rather than at
 * the end of the token's lifetime. `cache()` collapses that to one query per
 * request across all server components.
 */

export interface AuthContext {
  user: SafeUser;
  role: Role;
  /** Present only for users whose role is PROVIDER. */
  providerId?: string;
  providerStatus?: string;
}

export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const { accessToken } = await readAuthCookies();
  if (!accessToken) return null;

  let userId: string;
  try {
    const claims = await verifyAccessToken(accessToken);
    userId = claims.sub;
  } catch {
    // An expired or malformed access token is simply "not signed in" here; the
    // client refreshes via /api/auth/refresh and retries.
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    include: { providerProfile: { select: { id: true, status: true } } },
  });
  if (!user) return null;

  return {
    user: toSafeUser(user),
    role: user.role,
    providerId: user.providerProfile?.id,
    providerStatus: user.providerProfile?.status,
  };
});

/** For API routes: throws instead of redirecting. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AppError('UNAUTHENTICATED', 'Please sign in first.');
  return ctx;
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!roles.includes(ctx.role)) {
    throw new AppError('FORBIDDEN', 'You are not authorised for this section.', {
      context: { required: roles, actual: ctx.role },
    });
  }
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireAuth();
  assertCan(ctx.role, permission);
  return ctx;
}

/** Providers must be onboarded before they can act on jobs. */
export async function requireProvider(): Promise<AuthContext & { providerId: string }> {
  const ctx = await requireRole('PROVIDER');
  if (!ctx.providerId) {
    throw new AppError(
      'NOT_FOUND',
      'Your provider profile is incomplete. Please finish onboarding.',
    );
  }
  return ctx as AuthContext & { providerId: string };
}

export async function requireStaff(): Promise<AuthContext> {
  return requireRole('ADMIN', 'SUPER_ADMIN');
}

// ------------------------------------------------------- page-level variants

/** For server components: redirects to login preserving the intended path. */
export async function requirePageAuth(returnTo?: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login';
    redirect(target);
  }
  return ctx;
}

export async function requirePageRole(roles: Role[], returnTo?: string): Promise<AuthContext> {
  const ctx = await requirePageAuth(returnTo);
  if (!roles.includes(ctx.role)) redirect('/403');
  return ctx;
}
