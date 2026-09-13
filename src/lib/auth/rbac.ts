import type { Role } from '@prisma/client';
import { AppError } from '../errors';

/**
 * Role model. ADMIN and SUPER_ADMIN share the staff surface; SUPER_ADMIN adds
 * the ability to change roles, commission and destructive settings.
 */

export const ROLE_RANK: Record<Role, number> = {
  CUSTOMER: 1,
  PROVIDER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export const isStaff = (role: Role): boolean => role === 'ADMIN' || role === 'SUPER_ADMIN';
export const isSuperAdmin = (role: Role): boolean => role === 'SUPER_ADMIN';

export type Permission =
  | 'booking:create'
  | 'booking:read:own'
  | 'booking:read:any'
  | 'booking:act:provider'
  | 'booking:act:admin'
  | 'quote:create'
  | 'quote:decide'
  | 'provider:manage:own'
  | 'provider:approve'
  | 'provider:suspend'
  | 'catalogue:write'
  | 'settings:read'
  | 'settings:write'
  | 'settings:write:financial'
  | 'user:role:write'
  | 'dispute:create'
  | 'dispute:resolve'
  | 'guarantee:create'
  | 'guarantee:decide'
  | 'payment:record'
  | 'payment:refund'
  | 'payout:manage'
  | 'review:create'
  | 'review:moderate'
  | 'analytics:read'
  | 'audit:read'
  | 'support:create'
  | 'support:manage'
  | 'membership:buy'
  | 'membership:manage';

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  CUSTOMER: [
    'booking:create',
    'booking:read:own',
    'review:create',
    'dispute:create',
    'guarantee:create',
    'support:create',
    'membership:buy',
  ],
  PROVIDER: [
    'booking:read:own',
    'booking:act:provider',
    'quote:create',
    'provider:manage:own',
    'support:create',
  ],
  ADMIN: [
    'booking:read:any',
    'booking:act:admin',
    'quote:decide',
    'provider:approve',
    'provider:suspend',
    'catalogue:write',
    'settings:read',
    'settings:write',
    'dispute:create',
    'dispute:resolve',
    'guarantee:decide',
    'payment:record',
    'payment:refund',
    'payout:manage',
    'review:moderate',
    'analytics:read',
    'audit:read',
    'support:manage',
    'support:create',
    'membership:manage',
  ],
  SUPER_ADMIN: [
    'booking:read:any',
    'booking:act:admin',
    'quote:decide',
    'provider:approve',
    'provider:suspend',
    'catalogue:write',
    'settings:read',
    'settings:write',
    'settings:write:financial',
    'user:role:write',
    'dispute:create',
    'dispute:resolve',
    'guarantee:decide',
    'payment:record',
    'payment:refund',
    'payout:manage',
    'review:moderate',
    'analytics:read',
    'audit:read',
    'support:manage',
    'support:create',
    'membership:manage',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new AppError('FORBIDDEN', 'You are not authorised to do that.', {
      context: { role, permission },
    });
  }
}

/** Landing route for a role after login. */
export function homeForRole(role: Role): string {
  switch (role) {
    case 'PROVIDER':
      return '/provider';
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return '/admin';
    default:
      return '/account';
  }
}
