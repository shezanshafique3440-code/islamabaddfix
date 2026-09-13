import { randomBytes } from 'crypto';
import type { Prisma, Role, User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { dummyVerify, hashPassword, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken, newFamilyId, signAccessToken } from './tokens';

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: SafeUser;
}

/** The user shape that may cross the network. Never includes passwordHash. */
export interface SafeUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: Role;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: Date;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    phoneVerified: user.phoneVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Normalise Pakistani phone numbers to E.164 so uniqueness actually holds:
 * 0300-1234567, 03001234567, +923001234567 and 923001234567 are one number.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  return `+92${digits}`;
}

export async function issueSession(
  user: User,
  meta: RequestMeta,
  familyId = newFamilyId(),
): Promise<IssuedSession> {
  const { raw, hash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });
  const accessToken = await signAccessToken({ userId: user.id, role: user.role, familyId });
  return {
    accessToken,
    refreshToken: raw,
    csrfToken: randomBytes(24).toString('base64url'),
    user: toSafeUser(user),
  };
}

// ---------------------------------------------------------------- registration

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role?: Extract<Role, 'CUSTOMER' | 'PROVIDER'>;
}

/**
 * Self-service registration. Only CUSTOMER and PROVIDER can ever be created
 * this way — the role is clamped here, not taken from the client's word for it.
 * Staff accounts are created by a SUPER_ADMIN or the seed script.
 */
export async function registerUser(
  input: RegisterInput,
  meta: RequestMeta,
): Promise<IssuedSession> {
  const email = normalizeEmail(input.email);
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const role: Role = input.role === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    select: { email: true, phone: true },
  });
  if (existing) {
    throw existing.email === email
      ? new AppError('EMAIL_TAKEN', 'That email is already registered. Please sign in.')
      : new AppError('PHONE_TAKEN', 'That phone number is already registered.');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        phone,
        passwordHash,
        fullName: input.fullName.trim(),
        role,
      },
    });
    if (role === 'CUSTOMER') {
      await tx.customerProfile.create({ data: { userId: created.id } });
    }
    return created;
  });

  return issueSession(user, meta);
}

// ---------------------------------------------------------------------- login

/**
 * Verify an email and password, without issuing anything.
 *
 * Split from session creation so the login route can decide what happens next:
 * an account with a second factor gets a challenge instead of a session, and no
 * half-authorised cookie is ever set. Lockout, the disabled-account check and
 * the audit trail all live here, because they apply either way.
 */
export async function authenticateCredentials(
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<User> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Spend comparable time so response latency does not leak account existence.
    await dummyVerify(input.password);
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entity: 'User',
      metadata: { email, reason: 'unknown_email' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError('INVALID_CREDENTIALS', 'Wrong email or password.');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(
      'ACCOUNT_LOCKED',
      `Too many failed attempts. This account is locked for ${minutes} minutes.`,
    );
  }

  if (!user.isActive || user.deletedAt) {
    throw new AppError('ACCOUNT_DISABLED', 'This account is disabled. Please contact support.');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.AUTH_MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entity: 'User',
      entityId: user.id,
      metadata: { attempts, locked: shouldLock },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError('INVALID_CREDENTIALS', 'Wrong email or password.');
  }

  const fresh = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
    entity: 'User',
    entityId: user.id,
    actorUserId: user.id,
    actorRole: user.role,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return fresh;
}

/** Credentials plus a session — what every caller with no second factor wants. */
export async function loginUser(
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<IssuedSession> {
  const user = await authenticateCredentials(input, meta);
  return issueSession(user, meta);
}

// -------------------------------------------------------------------- refresh

/**
 * Rotate a refresh token.
 *
 * Presenting a token that was already rotated means the token leaked — the
 * whole family is revoked and the user must log in again.
 */
export async function refreshSession(
  rawRefreshToken: string,
  meta: RequestMeta,
): Promise<IssuedSession> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) throw new AppError('UNAUTHENTICATED', 'Your session is no longer valid. Please sign in again.');

  if (stored.replacedById !== null || stored.revokedAt !== null) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit({
      action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
      entity: 'RefreshToken',
      entityId: stored.id,
      actorUserId: stored.userId,
      metadata: { familyId: stored.familyId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError(
      'TOKEN_REUSED',
      'This session was ended for your security. Please sign in again.',
    );
  }

  if (stored.expiresAt <= new Date()) {
    throw new AppError('TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  if (!stored.user.isActive || stored.user.deletedAt) {
    throw new AppError('ACCOUNT_DISABLED', 'This account is disabled.');
  }

  const { raw, hash } = generateRefreshToken();
  const successor = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hash,
        familyId: stored.familyId,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
      },
    });
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: created.id, revokedAt: new Date() },
    });
    return created;
  });

  const accessToken = await signAccessToken({
    userId: stored.user.id,
    role: stored.user.role,
    familyId: successor.familyId,
  });

  return {
    accessToken,
    refreshToken: raw,
    csrfToken: randomBytes(24).toString('base64url'),
    user: toSafeUser(stored.user),
  };
}

// --------------------------------------------------------------------- logout

/** Revoke the presented token's whole family (this device's session chain). */
export async function logoutSession(rawRefreshToken?: string): Promise<void> {
  if (!rawRefreshToken) return;
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawRefreshToken) },
    select: { familyId: true },
  });
  if (!stored) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: stored.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every session for a user — used on password change and suspension. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('NOT_FOUND', 'User nahi mila.');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError('INVALID_CREDENTIALS', 'Your current password is wrong.');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  // Any stolen session is now useless.
  await revokeAllSessions(userId);
}

export type UserWithProfiles = Prisma.UserGetPayload<{
  include: { customerProfile: true; providerProfile: true };
}>;
