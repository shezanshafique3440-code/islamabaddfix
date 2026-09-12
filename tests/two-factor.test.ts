import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/lib/errors';
import {
  base32Encode,
  currentTotp,
  generateRecoveryCodes,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from '@/lib/auth/totp';
import {
  beginTwoFactorEnrolment,
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  isTwoFactorEnabled,
  twoFactorStatus,
  verifySecondFactor,
} from '@/lib/auth/two-factor';
import { createUser, db } from './helpers';
import { truncateAll } from './setup';

/**
 * Two-factor authentication for staff.
 *
 * The algorithm is checked against RFC 6238's own published vectors rather than
 * against itself — an implementation that is confidently wrong in the same way
 * in both the code and the test is the failure mode worth guarding against.
 */

describe('TOTP algorithm', () => {
  // RFC 6238 appendix B, SHA-1 rows: the ASCII seed "12345678901234567890".
  const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
  const RFC_VECTORS: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  it.each(RFC_VECTORS)('matches the RFC 6238 vector at t=%i', (seconds, expected) => {
    expect(currentTotp(RFC_SECRET, new Date(seconds * 1000))).toBe(expected);
  });

  it('accepts the code for the current step', () => {
    const secret = generateTotpSecret();
    const now = new Date();
    expect(verifyTotp(secret, currentTotp(secret, now), { at: now }).valid).toBe(true);
  });

  it('tolerates a phone whose clock is half a minute out, either way', () => {
    const secret = generateTotpSecret();
    const now = new Date();

    for (const skew of [-30_000, 30_000]) {
      const code = currentTotp(secret, new Date(now.getTime() + skew));
      expect(verifyTotp(secret, code, { at: now }).valid).toBe(true);
    }
  });

  it('refuses a code from further out than that', () => {
    const secret = generateTotpSecret();
    const now = new Date();
    const stale = currentTotp(secret, new Date(now.getTime() - 120_000));
    expect(verifyTotp(secret, stale, { at: now }).valid).toBe(false);
  });

  it('refuses a code from a different secret', () => {
    const mine = generateTotpSecret();
    const theirs = generateTotpSecret();
    const now = new Date();
    expect(verifyTotp(mine, currentTotp(theirs, now), { at: now }).valid).toBe(false);
  });

  it('refuses a step that has already been spent', () => {
    const secret = generateTotpSecret();
    const now = new Date();
    const code = currentTotp(secret, now);

    const first = verifyTotp(secret, code, { at: now });
    expect(first.valid).toBe(true);
    // Read over a shoulder, it is useless once the real user has finished.
    expect(verifyTotp(secret, code, { at: now, lastUsedStep: first.step }).valid).toBe(false);
  });

  it('refuses anything that is not six digits', () => {
    const secret = generateTotpSecret();
    for (const bad of ['', '12345', '1234567', 'abcdef']) {
      expect(verifyTotp(secret, bad).valid).toBe(false);
    }
  });

  it('produces a URI an authenticator app can read', () => {
    const secret = generateTotpSecret();
    const uri = totpUri({ secret, account: 'admin@islamabadfix.pk', issuer: 'Islamabad Fix' });

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('generates distinct recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });
});

describe('two-factor enrolment', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function enrolledAdmin() {
    const admin = await createUser({ role: 'ADMIN', email: 'staff@test.local' });
    const { secret } = await beginTwoFactorEnrolment({
      userId: admin.id,
      role: 'ADMIN',
      email: admin.email,
    });
    const { recoveryCodes } = await confirmTwoFactorEnrolment(admin.id, currentTotp(secret));
    return { admin, secret, recoveryCodes };
  }

  it('is not enforced until the user proves their app works', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await beginTwoFactorEnrolment({ userId: admin.id, role: 'ADMIN', email: admin.email });

    // An unconfirmed row would otherwise lock somebody out of an account they
    // never finished setting up.
    expect(await isTwoFactorEnabled(admin.id)).toBe(false);
    expect(await twoFactorStatus(admin.id)).toMatchObject({ enabled: false, pending: true });
  });

  it('turns on once a real code is entered, and hands over recovery codes', async () => {
    const { admin, recoveryCodes } = await enrolledAdmin();

    expect(await isTwoFactorEnabled(admin.id)).toBe(true);
    expect(recoveryCodes).toHaveLength(10);
    expect(await twoFactorStatus(admin.id)).toMatchObject({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
  });

  it('refuses a wrong code at enrolment', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const { secret } = await beginTwoFactorEnrolment({
      userId: admin.id,
      role: 'ADMIN',
      email: admin.email,
    });
    const wrong = currentTotp(secret) === '000000' ? '111111' : '000000';

    await expect(confirmTwoFactorEnrolment(admin.id, wrong)).rejects.toThrow(/ghalat/i);
    expect(await isTwoFactorEnabled(admin.id)).toBe(false);
  });

  it('never stores the secret in a readable form', async () => {
    const { admin, secret } = await enrolledAdmin();

    const row = await db.twoFactorSecret.findUniqueOrThrow({ where: { userId: admin.id } });
    // A stolen database dump alone must not yield working second factors.
    expect(row.secret).not.toBe(secret);
    expect(row.secret).not.toContain(secret);
  });

  it('stores only hashes of the recovery codes', async () => {
    const { admin, recoveryCodes } = await enrolledAdmin();

    const row = await db.twoFactorSecret.findUniqueOrThrow({ where: { userId: admin.id } });
    for (const code of recoveryCodes) {
      expect(row.recoveryCodeHashes).not.toContain(code);
    }
    expect(row.recoveryCodeHashes.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
  });

  it('is offered to staff only', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });

    const failure = await beginTwoFactorEnrolment({
      userId: customer.id,
      role: 'CUSTOMER',
      email: customer.email,
    }).catch((error: AppError) => error);
    expect((failure as AppError).code).toBe('FORBIDDEN');
  });

  it('refuses to enrol twice', async () => {
    const { admin } = await enrolledAdmin();

    await expect(
      beginTwoFactorEnrolment({ userId: admin.id, role: 'ADMIN', email: admin.email }),
    ).rejects.toThrow(/pehle se on/i);
  });
});

describe('two-factor at sign-in', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function enrolledAdmin() {
    const admin = await createUser({ role: 'ADMIN', email: 'staff@test.local' });
    const { secret } = await beginTwoFactorEnrolment({
      userId: admin.id,
      role: 'ADMIN',
      email: admin.email,
    });
    const { recoveryCodes } = await confirmTwoFactorEnrolment(admin.id, currentTotp(secret));

    // Enrolment spends the step its confirmation code came from — that is the
    // replay protection working. Sign-in happens later, so wind the recorded
    // step back to represent the minutes that have passed since.
    const row = await db.twoFactorSecret.findUniqueOrThrow({ where: { userId: admin.id } });
    await db.twoFactorSecret.update({
      where: { userId: admin.id },
      data: { lastUsedStep: row.lastUsedStep! - BigInt(10) },
    });

    return { admin, secret, recoveryCodes };
  }

  it('accepts a current code', async () => {
    const { admin, secret } = await enrolledAdmin();
    expect(await verifySecondFactor(admin.id, currentTotp(secret))).toBe(true);
  });

  it('refuses the same code twice', async () => {
    const { admin, secret } = await enrolledAdmin();
    const code = currentTotp(secret);

    expect(await verifySecondFactor(admin.id, code)).toBe(true);
    expect(await verifySecondFactor(admin.id, code)).toBe(false);
  });

  it('accepts a recovery code, once', async () => {
    const { admin, recoveryCodes } = await enrolledAdmin();
    const code = recoveryCodes[0]!;

    expect(await verifySecondFactor(admin.id, code)).toBe(true);
    expect(await verifySecondFactor(admin.id, code)).toBe(false);
    expect(await twoFactorStatus(admin.id)).toMatchObject({ recoveryCodesRemaining: 9 });
  });

  it('records that a recovery code was spent', async () => {
    const { admin, recoveryCodes } = await enrolledAdmin();
    await verifySecondFactor(admin.id, recoveryCodes[0]!);

    const entry = await db.auditLog.findFirst({
      where: { entity: 'User', entityId: admin.id, action: 'auth.two_factor_recovery_used' },
    });
    expect(entry).not.toBeNull();
  });

  it('ignores spacing and case in a recovery code', async () => {
    const { admin, recoveryCodes } = await enrolledAdmin();
    const messy = recoveryCodes[0]!.toLowerCase().replace('-', ' - ');
    expect(await verifySecondFactor(admin.id, messy)).toBe(true);
  });

  it('returns false for an account with no second factor', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    expect(await verifySecondFactor(admin.id, '123456')).toBe(false);
  });

  it('needs a current code to switch off', async () => {
    const { admin, secret } = await enrolledAdmin();

    await expect(disableTwoFactor(admin.id, '000000')).rejects.toThrow(/ghalat/i);
    expect(await isTwoFactorEnabled(admin.id)).toBe(true);

    await disableTwoFactor(admin.id, currentTotp(secret));
    expect(await isTwoFactorEnabled(admin.id)).toBe(false);
  });
});
