import type { Role } from '@prisma/client';
import { prisma, type DbClient } from './db';

/**
 * Audit trail for privileged and financially meaningful actions.
 *
 * Writing an audit row must never break the operation it describes, so failures
 * are logged and swallowed. When the caller passes a transaction client the row
 * becomes part of that transaction instead.
 */

export const AUDIT_ACTIONS = {
  PROVIDER_APPROVED: 'provider.approved',
  PROVIDER_REJECTED: 'provider.rejected',
  PROVIDER_SUSPENDED: 'provider.suspended',
  PROVIDER_REINSTATED: 'provider.reinstated',
  PROVIDER_VERIFICATION_UPDATED: 'provider.verification_updated',
  BOOKING_STATUS_CHANGED: 'booking.status_changed',
  BOOKING_MODIFIED: 'booking.modified',
  BOOKING_CANCELLED: 'booking.cancelled',
  QUOTE_SUBMITTED: 'quote.submitted',
  QUOTE_DECIDED: 'quote.decided',
  PAYMENT_RECORDED: 'payment.recorded',
  PAYMENT_REFUNDED: 'payment.refunded',
  COMMISSION_CHANGED: 'settings.commission_changed',
  SETTINGS_CHANGED: 'settings.changed',
  DISPUTE_RESOLVED: 'dispute.resolved',
  GUARANTEE_DECIDED: 'guarantee.decided',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DISABLED: 'user.disabled',
  CATEGORY_CHANGED: 'catalogue.category_changed',
  SERVICE_CHANGED: 'catalogue.service_changed',
  ZONE_CHANGED: 'catalogue.zone_changed',
  PROMO_CHANGED: 'promo.changed',
  PAYOUT_CREATED: 'payout.created',
  PAYOUT_MARKED_PAID: 'payout.marked_paid',
  FILE_ACCESS_DENIED: 'file.access_denied',
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  actorUserId?: string | null;
  actorRole?: Role | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput, client: DbClient = prisma): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record entry', {
      action: input.action,
      entity: input.entity,
      error: error instanceof Error ? error.message : error,
    });
  }
}
