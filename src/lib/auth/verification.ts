import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { VerificationPurpose } from '@prisma/client';
import { prisma } from '../db';
import { env, integrations } from '../env';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { notify, NOTIFICATION_EVENTS } from '../notifications';
import { hashPassword } from './password';
import { normalizePhone, revokeAllSessions } from './service';

/**
 * One-time secrets: password reset, email confirmation, phone OTP.
 *
 * Three rules shape every function here.
 *
 *  1. **Only a hash is stored.** A database leak must not hand somebody a
 *     working reset link, exactly as for refresh tokens.
 *  2. **Nothing reveals whether an account exists.** "Forgot password" gives
 *     the same answer for a registered address and an unknown one; anything
 *     else turns the endpoint into a user directory.
 *  3. **Delivery is reported honestly.** If email or SMS is not configured,
 *     the caller is told so plainly rather than shown a "check your inbox"
 *     message for a mail that was never sent.
 */

/** How long each kind of secret stays usable. */
const TTL_MINUTES: Record<VerificationPurpose, number> = {
  PASSWORD_RESET: 30,
  EMAIL_VERIFY: 60 * 24,
  PHONE_VERIFY: 10,
  // Long enough to open an authenticator app, short enough that a proven
  // password does not sit around waiting to be used.
  TWO_FACTOR_CHALLENGE: 5,
};

/** A six-digit code is guessable, so it gets a hard attempt ceiling. */
const MAX_OTP_ATTEMPTS = 5;

/**
 * How many secrets of one purpose a user may be issued in an hour.
 *
 * The three delivered kinds are capped tightly, because issuing one sends a
 * message to somebody — a mail-bomb is the attack. A two-factor challenge is
 * handed straight back to a caller who already proved the password and costs
 * nothing to produce, so capping it at the same number would lock a staff
 * member out for an hour after five mistyped codes. Its real controls are the
 * login limiter, which bounds attempts by IP *and* by address, and the
 * five-minute expiry.
 */
const ISSUE_LIMIT_PER_HOUR: Record<VerificationPurpose, number> = {
  PASSWORD_RESET: 5,
  EMAIL_VERIFY: 5,
  PHONE_VERIFY: 5,
  TWO_FACTOR_CHALLENGE: 30,
};

const hashSecret = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/** URL-safe, 256 bits. Used for the link-based purposes. */
const generateLinkToken = (): string => randomBytes(32).toString('base64url');

/** Six digits, uniformly distributed — `randomInt` is rejection-sampled. */
const generateOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface DeliveryReport {
  /** Whether the secret actually left the building. */
  delivered: boolean;
  /** Present only outside production when no channel is configured — see below. */
  devToken?: string;
  reason?: string;
}

/**
 * Development escape hatch.
 *
 * With no email or SMS provider configured there is no way to receive a token,
 * which would make the whole flow untestable on a fresh checkout. Outside
 * production we hand the token back to the caller and say plainly that we are
 * doing so. In production this returns nothing, ever: a reset token in an HTTP
 * response is a reset token in a proxy log.
 */
function devEcho(token: string): Pick<DeliveryReport, 'devToken' | 'reason'> {
  if (env.NODE_ENV === 'production') {
    return {
      reason:
        'Email and SMS are not configured on this deployment, so nothing could be sent. Please contact support.',
    };
  }
  return {
    devToken: token,
    reason:
      'Email and SMS are not configured, so the token is shown here in development. This never happens in production.',
  };
}

/**
 * Issue a secret, invalidating any earlier live one for the same purpose.
 *
 * Superseding rather than accumulating means a user who taps "resend" five
 * times ends up with one working code, not five.
 */
async function issue(params: {
  userId: string;
  purpose: VerificationPurpose;
  sentTo: string | null;
  raw: string;
}): Promise<void> {
  const now = new Date();
  const issuedThisHour = await prisma.verificationToken.count({
    where: {
      userId: params.userId,
      purpose: params.purpose,
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (issuedThisHour >= ISSUE_LIMIT_PER_HOUR[params.purpose]) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many requests. Please try again shortly.',
    );
  }

  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId: params.userId, purpose: params.purpose, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.verificationToken.create({
      data: {
        userId: params.userId,
        purpose: params.purpose,
        tokenHash: hashSecret(params.raw),
        sentTo: params.sentTo,
        expiresAt: new Date(now.getTime() + TTL_MINUTES[params.purpose] * 60_000),
      },
    }),
  ]);
}

/** Find a live secret by its hash, or explain why it is not usable. */
async function consume(purpose: VerificationPurpose, raw: string, userId?: string) {
  const token = await prisma.verificationToken.findFirst({
    where: {
      purpose,
      tokenHash: hashSecret(raw),
      ...(userId ? { userId } : {}),
    },
    include: {
      user: { select: { id: true, email: true, phone: true, isActive: true, deletedAt: true } },
    },
  });

  if (!token || token.consumedAt || token.expiresAt < new Date()) {
    throw new AppError(
      'TOKEN_EXPIRED',
      'This link or code no longer works. Please request a new one.',
    );
  }
  if (!token.user.isActive || token.user.deletedAt) {
    throw new AppError('ACCOUNT_DISABLED', 'This account is not active.');
  }

  await prisma.verificationToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });
  return token;
}

// ======================== two-factor challenge =============================

/**
 * Record that a password was accepted, pending the second factor.
 *
 * Deliberately not a session cookie: a half-authenticated session is a session,
 * and one left in a browser is a way in. This is an opaque, single-use,
 * five-minute token that proves one thing and grants nothing.
 */
export async function issueTwoFactorChallenge(userId: string): Promise<string> {
  const raw = generateLinkToken();
  await issue({ userId, purpose: 'TWO_FACTOR_CHALLENGE', sentTo: null, raw });
  return raw;
}

/** Spend a challenge, returning the user it belongs to. */
export async function consumeTwoFactorChallenge(rawToken: string): Promise<string> {
  const token = await consume('TWO_FACTOR_CHALLENGE', rawToken);
  return token.userId;
}

// ========================== password reset ================================

/**
 * Start a password reset.
 *
 * Returns the same shape whether or not the address is registered. The only
 * thing that varies is delivery, and that is a property of the deployment, not
 * of the account.
 */
export async function requestPasswordReset(
  email: string,
  meta?: { ipAddress?: string | null },
): Promise<DeliveryReport> {
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), isActive: true, deletedAt: null },
    select: { id: true, email: true, fullName: true },
  });

  // Unknown address: say nothing, do nothing, look identical.
  if (!user) {
    return { delivered: integrations.email.configured };
  }

  const raw = generateLinkToken();
  await issue({ userId: user.id, purpose: 'PASSWORD_RESET', sentTo: user.email, raw });

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    entity: 'User',
    entityId: user.id,
    actorUserId: user.id,
    metadata: { ipAddress: meta?.ipAddress ?? null },
  });

  if (!integrations.email.configured) {
    return { delivered: false, ...devEcho(raw) };
  }

  const link = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
  await notify({
    event: NOTIFICATION_EVENTS.PASSWORD_RESET,
    userId: user.id,
    title: 'Reset your password',
    body: `Open this link to set a new password: ${link}\n\nIt works for ${TTL_MINUTES.PASSWORD_RESET} minutes. If you did not ask for this, ignore this email — your password stays as it is.`,
    href: '/reset-password',
    channels: ['EMAIL'],
    data: { link },
  });

  return { delivered: true };
}

/**
 * Finish a password reset.
 *
 * Every session is revoked, including any the attacker may hold: if somebody
 * needed this flow, the old sessions are exactly what must not survive it.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const token = await consume('PASSWORD_RESET', rawToken);

  await prisma.user.update({
    where: { id: token.userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await revokeAllSessions(token.userId);

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
    entity: 'User',
    entityId: token.userId,
    actorUserId: token.userId,
  });

  await notify({
    event: NOTIFICATION_EVENTS.PASSWORD_CHANGED,
    userId: token.userId,
    title: 'Your password was changed',
    body: 'If this was not you, contact support immediately. You have been signed out on every device.',
    href: '/login',
  });
}

/** Is this reset token still usable? Lets the UI fail before asking for a password. */
export async function isResetTokenLive(rawToken: string): Promise<boolean> {
  const token = await prisma.verificationToken.findFirst({
    where: {
      purpose: 'PASSWORD_RESET',
      tokenHash: hashSecret(rawToken),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return token !== null;
}

// ========================= email verification ==============================

export async function requestEmailVerification(userId: string): Promise<DeliveryReport> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');
  if (user.emailVerifiedAt) {
    throw new AppError('CONFLICT', 'This email is already verified.');
  }

  const raw = generateLinkToken();
  await issue({ userId: user.id, purpose: 'EMAIL_VERIFY', sentTo: user.email, raw });

  if (!integrations.email.configured) {
    return { delivered: false, ...devEcho(raw) };
  }

  const link = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(raw)}`;
  await notify({
    event: NOTIFICATION_EVENTS.EMAIL_VERIFICATION,
    userId: user.id,
    title: 'Verify your email',
    body: `Open this link to confirm your email address: ${link}`,
    href: '/account/profile',
    channels: ['EMAIL'],
    data: { link },
  });

  return { delivered: true };
}

export async function confirmEmailVerification(rawToken: string): Promise<{ userId: string }> {
  const token = await consume('EMAIL_VERIFY', rawToken);

  // The address must still be the one the link was issued for; changing the
  // email after requesting verification must not carry the proof across.
  if (token.sentTo && token.user.email !== token.sentTo) {
    throw new AppError(
      'TOKEN_EXPIRED',
      'The email address changed after this link was sent. Please request a new one.',
    );
  }

  await prisma.user.update({
    where: { id: token.userId },
    data: { emailVerifiedAt: new Date() },
  });
  await syncProviderBadge(token.userId, 'EMAIL');

  await recordAudit({
    action: AUDIT_ACTIONS.EMAIL_VERIFIED,
    entity: 'User',
    entityId: token.userId,
    actorUserId: token.userId,
  });

  return { userId: token.userId };
}

// ========================= phone verification ==============================

export async function requestPhoneVerification(
  userId: string,
  phoneInput?: string,
): Promise<DeliveryReport & { sentTo: string }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { id: true, phone: true, phoneVerifiedAt: true },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');

  const phone = phoneInput ? normalizePhone(phoneInput) : user.phone;
  if (!phone) {
    throw new AppError('VALIDATION_ERROR', 'Add a phone number first.');
  }
  if (user.phoneVerifiedAt && phone === user.phone) {
    throw new AppError('CONFLICT', 'This number is already verified.');
  }

  // A number already proven by somebody else cannot be claimed here.
  const taken = await prisma.user.findFirst({
    where: { phone, id: { not: user.id }, deletedAt: null },
    select: { id: true },
  });
  if (taken) {
    throw new AppError('PHONE_TAKEN', 'That number is registered to another account.');
  }

  const code = generateOtp();
  await issue({ userId: user.id, purpose: 'PHONE_VERIFY', sentTo: phone, raw: code });

  if (!integrations.sms.configured) {
    return { delivered: false, sentTo: phone, ...devEcho(code) };
  }

  await notify({
    event: NOTIFICATION_EVENTS.PHONE_VERIFICATION,
    userId: user.id,
    title: 'Verification code',
    body: `Your Islamabad Fix code is ${code}. It is valid for ${TTL_MINUTES.PHONE_VERIFY} minutes. Do not share it with anyone.`,
    channels: ['SMS'],
    data: { sentTo: phone },
  });

  return { delivered: true, sentTo: phone };
}

/**
 * Check a phone OTP.
 *
 * Attempts are counted against the live token rather than the account, so a
 * wrong guess burns the code, not the user's ability to try again with a new
 * one.
 */
export async function confirmPhoneVerification(userId: string, code: string): Promise<void> {
  const live = await prisma.verificationToken.findFirst({
    where: { userId, purpose: 'PHONE_VERIFY', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!live) {
    throw new AppError('TOKEN_EXPIRED', 'That code has expired. Request a new one.');
  }

  if (!constantTimeEquals(live.tokenHash, hashSecret(code.trim()))) {
    const attempts = live.attempts + 1;
    await prisma.verificationToken.update({
      where: { id: live.id },
      // Burn the code once the ceiling is reached — a six-digit secret does not
      // survive unlimited guessing.
      data: { attempts, ...(attempts >= MAX_OTP_ATTEMPTS ? { consumedAt: new Date() } : {}) },
    });
    throw new AppError(
      'VALIDATION_ERROR',
      attempts >= MAX_OTP_ATTEMPTS
        ? 'Too many wrong attempts. Request a new code.'
        : `Wrong code. ${MAX_OTP_ATTEMPTS - attempts} attempts left.`,
    );
  }

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: live.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phoneVerifiedAt: new Date(), ...(live.sentTo ? { phone: live.sentTo } : {}) },
    }),
  ]);
  await syncProviderBadge(userId, 'PHONE');

  await recordAudit({
    action: AUDIT_ACTIONS.PHONE_VERIFIED,
    entity: 'User',
    entityId: userId,
    actorUserId: userId,
  });
}

/**
 * A completed check earns its badge — and only its own badge.
 *
 * An OTP genuinely proves control of the number, so `PHONE` becomes APPROVED.
 * It says nothing about identity, licensing or insurance, and sets nothing else.
 */
async function syncProviderBadge(userId: string, kind: 'PHONE' | 'EMAIL'): Promise<void> {
  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!provider) return;

  await prisma.providerVerification.upsert({
    where: { providerId_kind: { providerId: provider.id, kind } },
    create: { providerId: provider.id, kind, status: 'APPROVED', reviewedAt: new Date() },
    update: { status: 'APPROVED', reviewedAt: new Date() },
  });
}

/** Housekeeping: drop secrets that are spent or long expired. */
export async function pruneVerificationTokens(): Promise<number> {
  const { count } = await prisma.verificationToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
        { consumedAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
      ],
    },
  });
  return count;
}
