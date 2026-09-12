import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { settingWriteSchema } from '@/lib/validation/schemas';
import {
  getAllSettings,
  setSetting,
  settingsMetadata,
  settingKeys,
  type SettingKey,
} from '@/lib/settings';
import { AppError } from '@/lib/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';
import { can } from '@/lib/auth/rbac';

/** Current values plus the metadata that renders the settings form. */
export const GET = route(async () => {
  await requirePermission('settings:read');
  const [values, metadata] = await Promise.all([getAllSettings(), settingsMetadata()]);
  return ok({ values, metadata });
});

/**
 * Update one setting.
 *
 * Financially sensitive keys (commission, cancellation fee) need the stronger
 * `settings:write:financial` permission, which only SUPER_ADMIN holds.
 */
const FINANCIAL_KEYS: readonly SettingKey[] = [
  'platform.commissionRateBp',
  'booking.cancellationFeePaisa',
  'emergency.defaultFeePaisa',
  'emergency.maxFeePaisa',
];

export const PATCH = route(async (request) => {
  const ctx = await requirePermission('settings:write');
  const input = await parseJson(request, settingWriteSchema);

  if (!settingKeys.includes(input.key as SettingKey)) {
    throw new AppError('VALIDATION_ERROR', `Setting "${input.key}" mojood nahi hai.`);
  }
  const key = input.key as SettingKey;

  if (FINANCIAL_KEYS.includes(key) && !can(ctx.role, 'settings:write:financial')) {
    throw new AppError('FORBIDDEN', 'Yeh financial setting sirf super admin badal sakta hai.');
  }

  const previous = (await getAllSettings())[key];
  const value = await setSetting(key, input.value, ctx.user.id);

  await recordAudit({
    action:
      key === 'platform.commissionRateBp'
        ? AUDIT_ACTIONS.COMMISSION_CHANGED
        : AUDIT_ACTIONS.SETTINGS_CHANGED,
    entity: 'Setting',
    entityId: key,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    metadata: { key, previous, next: value },
  });

  return ok({ key, value });
});
