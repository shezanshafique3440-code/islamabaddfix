import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { isStaff } from '../auth/rbac';
import { generateRecoveryCodes, generateTotpSecret, totpUri, verifyTotp } from './totp';

/**
 * Second factor for staff accounts.
 *
 * The admin panel can approve providers, change what the platform earns and
 * issue refunds. A password alone is thin protection for that, so staff can
 * add a TOTP factor and — once enabled — cannot sign in without it.
 *
 * Deliberately opt-in per account rather than forced on: forcing it before
 * anybody has an authenticator app set up locks the first administrator out of
 * their own platform on day one. Making it *available* and documented is the
 * step that belongs in the product; making it mandatory is a policy decision
 * for whoever runs the deployment.
 */

const ISSUER = 'Islamabad Fix';

/**
 * The secret must be recoverable — it is the input to the code calculation —
 * so it is encrypted rather than hashed. The key is derived from AUTH_SECRET,
 * which means rotating that secret invalidates enrolled factors; that is
 * documented, and the recovery codes exist for exactly this kind of day.
 */
function encryptionKey(): Buffer {
  return scryptSync(env.AUTH_SECRET, 'islamabad-fix.2fa.v1', 32);
}

function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

const hashCode = (raw: string): string =>
  createHash('sha256').update(raw.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

export interface TwoFactorStatus {
  enabled: boolean;
  /** Enrolment started but the user never proved they could read a code. */
  pending: boolean;
  recoveryCodesRemaining: number;
}

export async function twoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const row = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  return {
    enabled: row?.confirmedAt != null,
    pending: row != null && row.confirmedAt == null,
    recoveryCodesRemaining: row?.recoveryCodeHashes.length ?? 0,
  };
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const row = await prisma.twoFactorSecret.findUnique({
    where: { userId },
    select: { confirmedAt: true },
  });
  return row?.confirmedAt != null;
}

/**
 * Begin enrolment: generate a secret and hand back the QR payload.
 *
 * Nothing is enforced until `confirmTwoFactor` succeeds — an unconfirmed row
 * would otherwise lock somebody out of an account they never finished setting
 * up.
 */
export async function beginTwoFactorEnrolment(params: {
  userId: string;
  role: Role;
  email: string;
}): Promise<{ secret: string; uri: string }> {
  if (!isStaff(params.role)) {
    throw new AppError('FORBIDDEN', 'Two-factor is available on staff accounts only.');
  }
  if (await isTwoFactorEnabled(params.userId)) {
    throw new AppError('CONFLICT', 'Two-factor is already on.');
  }

  const secret = generateTotpSecret();
  await prisma.twoFactorSecret.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, secret: encryptSecret(secret), recoveryCodeHashes: [] },
    update: {
      secret: encryptSecret(secret),
      confirmedAt: null,
      lastUsedStep: null,
      recoveryCodeHashes: [],
    },
  });

  // The secret and the URI are returned once, here, and never stored in a
  // readable form or written to a log.
  return { secret, uri: totpUri({ secret, account: params.email, issuer: ISSUER }) };
}

/** Finish enrolment by proving the app is producing the right codes. */
export async function confirmTwoFactorEnrolment(
  userId: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  const row = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  if (!row) throw new AppError('NOT_FOUND', 'Start the setup first.');
  if (row.confirmedAt) throw new AppError('CONFLICT', 'Two-factor is already on.');

  const result = verifyTotp(decryptSecret(row.secret), code);
  if (!result.valid) {
    throw new AppError('VALIDATION_ERROR', 'Wrong code. Check that your app\u2019s clock is correct.');
  }

  const recoveryCodes = generateRecoveryCodes();
  await prisma.twoFactorSecret.update({
    where: { userId },
    data: {
      confirmedAt: new Date(),
      lastUsedStep: BigInt(result.step!),
      recoveryCodeHashes: recoveryCodes.map(hashCode),
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
    entity: 'User',
    entityId: userId,
    actorUserId: userId,
  });

  // Shown once. Only hashes are kept, exactly as for a password.
  return { recoveryCodes };
}

/**
 * Check a code at sign-in.
 *
 * Accepts either a TOTP code or one unused recovery code. A spent step is
 * refused, so a code read over somebody's shoulder is useless the moment the
 * real user has finished with it.
 */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const row = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  if (!row?.confirmedAt) return false;

  const result = verifyTotp(decryptSecret(row.secret), code, {
    lastUsedStep: row.lastUsedStep === null ? null : Number(row.lastUsedStep),
  });
  if (result.valid) {
    await prisma.twoFactorSecret.update({
      where: { userId },
      data: { lastUsedStep: BigInt(result.step!) },
    });
    return true;
  }

  // Recovery codes are single use: spending one removes it.
  const hashed = hashCode(code);
  if (row.recoveryCodeHashes.includes(hashed)) {
    await prisma.twoFactorSecret.update({
      where: { userId },
      data: { recoveryCodeHashes: row.recoveryCodeHashes.filter((entry) => entry !== hashed) },
    });
    await recordAudit({
      action: AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_USED,
      entity: 'User',
      entityId: userId,
      actorUserId: userId,
      metadata: { remaining: row.recoveryCodeHashes.length - 1 },
    });
    return true;
  }

  return false;
}

/** Turn it off. Needs a current code, so a hijacked session cannot do it. */
export async function disableTwoFactor(userId: string, code: string): Promise<void> {
  if (!(await verifySecondFactor(userId, code))) {
    throw new AppError('VALIDATION_ERROR', 'Wrong code.');
  }
  await prisma.twoFactorSecret.delete({ where: { userId } });

  await recordAudit({
    action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
    entity: 'User',
    entityId: userId,
    actorUserId: userId,
  });
}
