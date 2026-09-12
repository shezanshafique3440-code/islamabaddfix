import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  changePassword,
  loginUser,
  normalizePhone,
  refreshSession,
  registerUser,
  revokeAllSessions,
} from '@/lib/auth/service';
import { passwordSchema } from '@/lib/auth/password';
import { assertCan, can, homeForRole, isStaff } from '@/lib/auth/rbac';
import { db } from './helpers';
import { truncateAll } from './setup';

const meta = { ipAddress: '203.0.113.5', userAgent: 'vitest' };

describe('authentication', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('registers a customer and issues a session', async () => {
    const session = await registerUser(
      {
        email: 'Ayesha@Example.com',
        password: 'StrongPass123',
        fullName: 'Ayesha Khan',
        phone: '0300-1234567',
      },
      meta,
    );

    expect(session.user.role).toBe('CUSTOMER');
    // Email is normalised, so Ayesha@ and ayesha@ are the same account.
    expect(session.user.email).toBe('ayesha@example.com');
    // Phone is normalised to E.164 so uniqueness actually holds.
    expect(session.user.phone).toBe('+923001234567');
    expect(session.accessToken.length).toBeGreaterThan(20);
    expect(session.refreshToken.length).toBeGreaterThan(20);

    const profile = await db.customerProfile.findFirst({ where: { userId: session.user.id } });
    expect(profile).not.toBeNull();

    // The raw refresh token is never stored.
    const stored = await db.refreshToken.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toBe(session.refreshToken);
  });

  it('never lets self-registration create a staff account', async () => {
    const session = await registerUser(
      {
        email: 'sneaky@example.com',
        password: 'StrongPass123',
        fullName: 'Sneaky',
        // A client asking for admin is silently clamped, not honoured.
        role: 'ADMIN' as unknown as 'CUSTOMER',
      },
      meta,
    );
    expect(session.user.role).toBe('CUSTOMER');
  });

  it('creates a provider account without a customer profile', async () => {
    const session = await registerUser(
      {
        email: 'provider@example.com',
        password: 'StrongPass123',
        fullName: 'Ali Raza',
        role: 'PROVIDER',
      },
      meta,
    );
    expect(session.user.role).toBe('PROVIDER');
    expect(await db.customerProfile.count()).toBe(0);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await registerUser(
      { email: 'dup@example.com', password: 'StrongPass123', fullName: 'First' },
      meta,
    );
    await expect(
      registerUser(
        { email: 'DUP@example.com', password: 'StrongPass123', fullName: 'Second' },
        meta,
      ),
    ).rejects.toThrow(/pehle se registered/i);
  });

  it('rejects a duplicate phone after normalisation', async () => {
    await registerUser(
      {
        email: 'a@example.com',
        password: 'StrongPass123',
        fullName: 'A',
        phone: '03001112222',
      },
      meta,
    );
    await expect(
      registerUser(
        {
          email: 'b@example.com',
          password: 'StrongPass123',
          fullName: 'B',
          // Same number written differently.
          phone: '+92 300 111 2222',
        },
        meta,
      ),
    ).rejects.toThrow(/phone number pehle se/i);
  });

  it('enforces the password policy', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase').success).toBe(false);
    expect(passwordSchema.safeParse('password123').success).toBe(false);
    expect(passwordSchema.safeParse('StrongPass123').success).toBe(true);
  });

  it('logs in with correct credentials and records the login', async () => {
    await registerUser(
      { email: 'login@example.com', password: 'StrongPass123', fullName: 'Login' },
      meta,
    );
    const session = await loginUser(
      { email: 'login@example.com', password: 'StrongPass123' },
      meta,
    );
    expect(session.user.email).toBe('login@example.com');

    const user = await db.user.findUniqueOrThrow({ where: { email: 'login@example.com' } });
    expect(user.lastLoginAt).not.toBeNull();

    const audit = await db.auditLog.findFirst({ where: { action: 'auth.login_succeeded' } });
    expect(audit).not.toBeNull();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await registerUser(
      { email: 'real@example.com', password: 'StrongPass123', fullName: 'Real' },
      meta,
    );

    const wrongPassword = await loginUser(
      { email: 'real@example.com', password: 'WrongPass123' },
      meta,
    ).catch((error: AppError) => error);
    const unknownEmail = await loginUser(
      { email: 'nobody@example.com', password: 'WrongPass123' },
      meta,
    ).catch((error: AppError) => error);

    // Identical code and message, so neither response reveals whether the
    // account exists.
    expect((wrongPassword as AppError).code).toBe('INVALID_CREDENTIALS');
    expect((unknownEmail as AppError).code).toBe('INVALID_CREDENTIALS');
    expect((wrongPassword as AppError).message).toBe((unknownEmail as AppError).message);
  });

  it('locks the account after repeated failures', async () => {
    await registerUser(
      { email: 'lock@example.com', password: 'StrongPass123', fullName: 'Lock' },
      meta,
    );

    const attempts = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 8);
    for (let i = 0; i < attempts; i += 1) {
      await loginUser({ email: 'lock@example.com', password: 'WrongPass123' }, meta).catch(
        () => undefined,
      );
    }

    // Even the correct password is refused while the lock holds.
    await expect(
      loginUser({ email: 'lock@example.com', password: 'StrongPass123' }, meta),
    ).rejects.toThrow(/locked/i);
  });

  it('clears the failure counter after a successful login', async () => {
    await registerUser(
      { email: 'reset@example.com', password: 'StrongPass123', fullName: 'Reset' },
      meta,
    );
    await loginUser({ email: 'reset@example.com', password: 'Wrong123456' }, meta).catch(
      () => undefined,
    );
    await loginUser({ email: 'reset@example.com', password: 'StrongPass123' }, meta);

    const user = await db.user.findUniqueOrThrow({ where: { email: 'reset@example.com' } });
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it('refuses a disabled account', async () => {
    const session = await registerUser(
      { email: 'disabled@example.com', password: 'StrongPass123', fullName: 'Disabled' },
      meta,
    );
    await db.user.update({ where: { id: session.user.id }, data: { isActive: false } });

    await expect(
      loginUser({ email: 'disabled@example.com', password: 'StrongPass123' }, meta),
    ).rejects.toThrow(/disabled/i);
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const session = await registerUser(
      { email: 'rotate@example.com', password: 'StrongPass123', fullName: 'Rotate' },
      meta,
    );

    const rotated = await refreshSession(session.refreshToken, meta);
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect(rotated.user.id).toBe(session.user.id);

    // The new one works.
    await expect(refreshSession(rotated.refreshToken, meta)).resolves.toBeDefined();
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const session = await registerUser(
      { email: 'reuse@example.com', password: 'StrongPass123', fullName: 'Reuse' },
      meta,
    );
    const rotated = await refreshSession(session.refreshToken, meta);

    // Replaying the original token is the signature of a stolen token.
    const failure = await refreshSession(session.refreshToken, meta).catch(
      (error: AppError) => error,
    );
    expect((failure as AppError).code).toBe('TOKEN_REUSED');

    // The successor is dead too — the entire chain is burned.
    await expect(refreshSession(rotated.refreshToken, meta)).rejects.toThrow();

    const audit = await db.auditLog.findFirst({
      where: { action: 'auth.token_reuse_detected' },
    });
    expect(audit).not.toBeNull();
  });

  it('changing the password revokes every session', async () => {
    const session = await registerUser(
      { email: 'change@example.com', password: 'StrongPass123', fullName: 'Change' },
      meta,
    );

    await changePassword(session.user.id, 'StrongPass123', 'BrandNewPass456');

    await expect(refreshSession(session.refreshToken, meta)).rejects.toThrow();
    await expect(
      loginUser({ email: 'change@example.com', password: 'BrandNewPass456' }, meta),
    ).resolves.toBeDefined();
  });

  it('refuses a password change with the wrong current password', async () => {
    const session = await registerUser(
      { email: 'wrongcur@example.com', password: 'StrongPass123', fullName: 'Wrong' },
      meta,
    );
    await expect(
      changePassword(session.user.id, 'NotThePassword1', 'BrandNewPass456'),
    ).rejects.toThrow(/ghalat/i);
  });

  it('revokes all sessions on demand', async () => {
    const session = await registerUser(
      { email: 'revoke@example.com', password: 'StrongPass123', fullName: 'Revoke' },
      meta,
    );
    await revokeAllSessions(session.user.id);
    await expect(refreshSession(session.refreshToken, meta)).rejects.toThrow();
  });

  it('normalises Pakistani phone formats to one canonical value', () => {
    for (const input of [
      '03001234567',
      '0300-1234567',
      '+923001234567',
      '923001234567',
      '00923001234567',
    ]) {
      expect(normalizePhone(input)).toBe('+923001234567');
    }
  });
});

describe('authorization', () => {
  it('grants each role only its own permissions', () => {
    expect(can('CUSTOMER', 'booking:create')).toBe(true);
    expect(can('CUSTOMER', 'provider:approve')).toBe(false);
    expect(can('CUSTOMER', 'booking:read:any')).toBe(false);

    expect(can('PROVIDER', 'quote:create')).toBe(true);
    expect(can('PROVIDER', 'booking:create')).toBe(false);
    expect(can('PROVIDER', 'payment:refund')).toBe(false);

    expect(can('ADMIN', 'provider:approve')).toBe(true);
    expect(can('ADMIN', 'payment:refund')).toBe(true);
    // Financial settings and role changes are super-admin only.
    expect(can('ADMIN', 'settings:write:financial')).toBe(false);
    expect(can('ADMIN', 'user:role:write')).toBe(false);

    expect(can('SUPER_ADMIN', 'settings:write:financial')).toBe(true);
    expect(can('SUPER_ADMIN', 'user:role:write')).toBe(true);
  });

  it('throws FORBIDDEN with context when a permission is missing', () => {
    expect(() => assertCan('CUSTOMER', 'provider:approve')).toThrow(AppError);
    try {
      assertCan('CUSTOMER', 'provider:approve');
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
      expect((error as AppError).status).toBe(403);
    }
  });

  it('identifies staff roles', () => {
    expect(isStaff('ADMIN')).toBe(true);
    expect(isStaff('SUPER_ADMIN')).toBe(true);
    expect(isStaff('CUSTOMER')).toBe(false);
    expect(isStaff('PROVIDER')).toBe(false);
  });

  it('routes each role to its own home', () => {
    expect(homeForRole('CUSTOMER')).toBe('/account');
    expect(homeForRole('PROVIDER')).toBe('/provider');
    expect(homeForRole('ADMIN')).toBe('/admin');
    expect(homeForRole('SUPER_ADMIN')).toBe('/admin');
  });
});
