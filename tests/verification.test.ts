import { createHash } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/lib/errors';
import {
  confirmEmailVerification,
  confirmPhoneVerification,
  isResetTokenLive,
  pruneVerificationTokens,
  requestEmailVerification,
  requestPasswordReset,
  requestPhoneVerification,
  resetPassword,
} from '@/lib/auth/verification';
import { loginUser } from '@/lib/auth/service';
import { createProvider, createService, createUser, createZone, db } from './helpers';
import { truncateAll } from './setup';

/**
 * Password reset, email confirmation and phone OTP.
 *
 * These are the flows that decide whether somebody who forgot a password gets
 * back in, and whether a "verified" badge means anything. Three properties are
 * load-bearing and each has a test that fails loudly if it stops holding:
 *  - the secret is never stored in a usable form;
 *  - the endpoint never reveals whether an account exists;
 *  - a used, expired or superseded secret is dead.
 */

const PASSWORD = 'TestPass!2024';
/** Every login records where it came from; tests supply a stand-in. */
const meta = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** The token only ever exists in the message; tests read it from the dev echo. */
async function resetTokenFor(email: string): Promise<string> {
  const report = await requestPasswordReset(email);
  if (!report.devToken) throw new Error('expected a development token');
  return report.devToken;
}

describe('password reset', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'ayesha@test.local' });
    const token = await resetTokenFor('ayesha@test.local');

    const row = await db.verificationToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).toBe(hashOf(token));
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('answers identically for a registered and an unknown address', async () => {
    await createUser({ role: 'CUSTOMER', email: 'known@test.local' });

    const known = await requestPasswordReset('known@test.local');
    const unknown = await requestPasswordReset('nobody@test.local');

    // Same shape, same delivery flag. The only difference is the dev echo,
    // which does not exist in production at all.
    expect(unknown.delivered).toBe(known.delivered);
    expect(await db.verificationToken.count()).toBe(1);
  });

  it('lets the customer set a new password and sign in with it', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'reset@test.local' });
    const token = await resetTokenFor('reset@test.local');

    await resetPassword(token, 'BrandNewPass!2026');

    const session = await loginUser({ email: 'reset@test.local', password: 'BrandNewPass!2026' }, meta);
    expect(session.user.id).toBe(user.id);
  });

  it('refuses the old password afterwards', async () => {
    await createUser({ role: 'CUSTOMER', email: 'old@test.local' });
    const token = await resetTokenFor('old@test.local');
    await resetPassword(token, 'BrandNewPass!2026');

    await expect(loginUser({ email: 'old@test.local', password: PASSWORD }, meta)).rejects.toThrow();
  });

  it('revokes every existing session — the point of resetting', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'sessions@test.local' });
    await loginUser({ email: 'sessions@test.local', password: PASSWORD }, meta);
    await loginUser({ email: 'sessions@test.local', password: PASSWORD }, meta);
    expect(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(2);

    const token = await resetTokenFor('sessions@test.local');
    await resetPassword(token, 'BrandNewPass!2026');

    expect(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it('clears a lockout, so a locked-out user can recover', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'locked@test.local' });
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 8, lockedUntil: new Date(Date.now() + 3600_000) },
    });

    const token = await resetTokenFor('locked@test.local');
    await resetPassword(token, 'BrandNewPass!2026');

    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.lockedUntil).toBeNull();
    expect(saved.failedLoginAttempts).toBe(0);
  });

  it('burns the token: it cannot be used twice', async () => {
    await createUser({ role: 'CUSTOMER', email: 'once@test.local' });
    const token = await resetTokenFor('once@test.local');
    await resetPassword(token, 'BrandNewPass!2026');

    const failure = await resetPassword(token, 'AnotherPass!2026').catch((e: AppError) => e);
    expect((failure as AppError).code).toBe('TOKEN_EXPIRED');
  });

  it('supersedes an earlier token when a new one is requested', async () => {
    await createUser({ role: 'CUSTOMER', email: 'again@test.local' });
    const first = await resetTokenFor('again@test.local');
    const second = await resetTokenFor('again@test.local');

    // Tapping "resend" leaves one working link, not two.
    expect(await isResetTokenLive(first)).toBe(false);
    expect(await isResetTokenLive(second)).toBe(true);
  });

  it('refuses an expired token', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'expired@test.local' });
    const token = await resetTokenFor('expired@test.local');
    // A CHECK constraint keeps `expiresAt` after `createdAt`, so ageing a token
    // means moving both — which is what a genuinely old row looks like anyway.
    await db.verificationToken.updateMany({
      where: { userId: user.id },
      data: {
        createdAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await isResetTokenLive(token)).toBe(false);
    await expect(resetPassword(token, 'BrandNewPass!2026')).rejects.toThrow(/kaam nahi karta/i);
  });

  it('refuses a token that is simply made up', async () => {
    await createUser({ role: 'CUSTOMER', email: 'forged@test.local' });
    await expect(resetPassword('not-a-real-token-at-all', 'BrandNewPass!2026')).rejects.toThrow();
  });

  it('does not issue anything for a disabled account', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'disabled@test.local' });
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });

    const report = await requestPasswordReset('disabled@test.local');
    expect(report.devToken).toBeUndefined();
    expect(await db.verificationToken.count()).toBe(0);
  });

  it('stops runaway requests for one account', async () => {
    await createUser({ role: 'CUSTOMER', email: 'flood@test.local' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestPasswordReset('flood@test.local');
    }
    await expect(requestPasswordReset('flood@test.local')).rejects.toThrow(/bohat zyada/i);
  });
});

describe('email verification', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('marks the address verified only after the link is opened', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });

    const report = await requestEmailVerification(user.id);
    expect(report.devToken).toBeTruthy();

    let saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.emailVerifiedAt).toBeNull();

    await confirmEmailVerification(report.devToken!);
    saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.emailVerifiedAt).not.toBeNull();
  });

  it('refuses to re-verify an address that is already done', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    await expect(requestEmailVerification(user.id)).rejects.toThrow(/pehle se verify/i);
  });

  it('will not carry proof across an address change', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });
    const report = await requestEmailVerification(user.id);

    await db.user.update({ where: { id: user.id }, data: { email: 'moved@test.local' } });

    await expect(confirmEmailVerification(report.devToken!)).rejects.toThrow(/badal gaya/i);
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.emailVerifiedAt).toBeNull();
  });

  it('earns the provider their EMAIL badge, and nothing else', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider, user } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
    });
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });

    const report = await requestEmailVerification(user.id);
    await confirmEmailVerification(report.devToken!);

    const approved = await db.providerVerification.findMany({
      where: { providerId: provider.id, status: 'APPROVED' },
      select: { kind: true },
    });
    expect(approved.map((row) => row.kind)).toEqual(['EMAIL']);
  });
});

describe('phone verification', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function unverifiedUser() {
    const user = await createUser({ role: 'CUSTOMER' });
    await db.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: null } });
    return user;
  }

  it('sends a six-digit code and accepts it', async () => {
    const user = await unverifiedUser();
    const report = await requestPhoneVerification(user.id);

    expect(report.devToken).toMatch(/^\d{6}$/);
    await confirmPhoneVerification(user.id, report.devToken!);

    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.phoneVerifiedAt).not.toBeNull();
  });

  it('refuses a wrong code and says how many tries are left', async () => {
    const user = await unverifiedUser();
    const report = await requestPhoneVerification(user.id);
    const wrong = report.devToken === '000000' ? '111111' : '000000';

    await expect(confirmPhoneVerification(user.id, wrong)).rejects.toThrow(/4 koshishein baqi/i);
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.phoneVerifiedAt).toBeNull();
  });

  it('burns the code after five wrong guesses', async () => {
    const user = await unverifiedUser();
    const report = await requestPhoneVerification(user.id);
    const wrong = report.devToken === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await confirmPhoneVerification(user.id, wrong).catch(() => {});
    }

    // Even the correct code is now useless — a six-digit secret does not
    // survive unlimited guessing.
    await expect(confirmPhoneVerification(user.id, report.devToken!)).rejects.toThrow(
      /muddat khatam/i,
    );
  });

  it('refuses a code that has expired', async () => {
    const user = await unverifiedUser();
    const report = await requestPhoneVerification(user.id);
    await db.verificationToken.updateMany({
      where: { userId: user.id },
      data: {
        createdAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(confirmPhoneVerification(user.id, report.devToken!)).rejects.toThrow(
      /muddat khatam/i,
    );
  });

  it('will not let one account claim a number another has proven', async () => {
    const owner = await createUser({ role: 'CUSTOMER', phone: '+923001112233' });
    await db.user.update({ where: { id: owner.id }, data: { phoneVerifiedAt: new Date() } });
    const other = await unverifiedUser();

    const failure = await requestPhoneVerification(other.id, '+923001112233').catch(
      (e: AppError) => e,
    );
    expect((failure as AppError).code).toBe('PHONE_TAKEN');
  });

  it('only one code is live at a time', async () => {
    const user = await unverifiedUser();
    const first = await requestPhoneVerification(user.id);
    const second = await requestPhoneVerification(user.id);

    await expect(confirmPhoneVerification(user.id, first.devToken!)).rejects.toThrow();
    await confirmPhoneVerification(user.id, second.devToken!);
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.phoneVerifiedAt).not.toBeNull();
  });

  it('earns the provider their PHONE badge, and nothing else', async () => {
    const service = await createService();
    const zone = await createZone();
    const { provider, user } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
    });
    await db.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: null } });

    const report = await requestPhoneVerification(user.id);
    await confirmPhoneVerification(user.id, report.devToken!);

    const approved = await db.providerVerification.findMany({
      where: { providerId: provider.id, status: 'APPROVED' },
      select: { kind: true },
    });
    // Proving a phone number proves a phone number. It is not an identity
    // check, and it must not quietly become one.
    expect(approved.map((row) => row.kind)).toEqual(['PHONE']);
  });
});

describe('housekeeping', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('prunes spent and long-expired secrets but keeps live ones', async () => {
    const user = await createUser({ role: 'CUSTOMER', email: 'prune@test.local' });
    await requestPasswordReset('prune@test.local');

    await db.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'EMAIL_VERIFY',
        tokenHash: hashOf('old'),
        createdAt: new Date(Date.now() - 72 * 3600_000),
        expiresAt: new Date(Date.now() - 48 * 3600_000),
      },
    });

    const removed = await pruneVerificationTokens();
    expect(removed).toBe(1);
    expect(await db.verificationToken.count()).toBe(1);
  });
});
