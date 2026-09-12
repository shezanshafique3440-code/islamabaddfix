import { prisma } from '../db';
import { AppError } from '../errors';

/**
 * Postgres-backed sliding-window rate limiter.
 *
 * Chosen over in-memory counters because the app is expected to run behind
 * more than one instance, where per-process counters are close to useless.
 * The interface is deliberately narrow so a Redis implementation can replace
 * the body without touching call sites.
 */

export interface RateLimitRule {
  /** Stable name, e.g. "auth:login". Combined with the caller identity. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { name: 'auth:login', limit: 10, windowSeconds: 300 },
  register: { name: 'auth:register', limit: 5, windowSeconds: 3600 },
  refresh: { name: 'auth:refresh', limit: 60, windowSeconds: 300 },
  // Changing a password requires the current one, so this endpoint is a
  // credential-guessing surface for anyone holding a stolen session.
  passwordChange: { name: 'auth:password', limit: 5, windowSeconds: 900 },
  // Mailing a reset link to somebody else's address is a nuisance attack, so
  // this is limited by address as well as by caller.
  passwordReset: { name: 'auth:password_reset', limit: 5, windowSeconds: 900 },
  verification: { name: 'auth:verification', limit: 6, windowSeconds: 900 },
  // Guessing a six-digit code: the token's own attempt counter is the real
  // ceiling, this stops somebody cycling through fresh codes to get more.
  otpAttempt: { name: 'auth:otp', limit: 12, windowSeconds: 900 },
  // Generous: a real back-and-forth about a job runs to dozens of messages,
  // and this only needs to stop scripted flooding.
  message: { name: 'booking:message', limit: 60, windowSeconds: 600 },
  // An export reads most of a person's history; a handful a day is plenty.
  dataExport: { name: 'account:export', limit: 5, windowSeconds: 86_400 },
  bookingCreate: { name: 'booking:create', limit: 12, windowSeconds: 3600 },
  upload: { name: 'file:upload', limit: 40, windowSeconds: 3600 },
  aiIntake: { name: 'ai:intake', limit: 30, windowSeconds: 3600 },
  review: { name: 'review:create', limit: 20, windowSeconds: 3600 },
  supportTicket: { name: 'support:create', limit: 10, windowSeconds: 3600 },
  webhook: { name: 'webhook:inbound', limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Occasionally prune expired rows so the table does not grow without bound. */
async function maybePrune(): Promise<void> {
  if (Math.random() > 0.02) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  rule: RateLimitRule,
  identity: string,
): Promise<RateLimitResult> {
  const bucket = `${rule.name}:${identity}`;
  const since = new Date(Date.now() - rule.windowSeconds * 1000);

  const used = await prisma.rateLimitHit.count({ where: { bucket, createdAt: { gte: since } } });
  if (used >= rule.limit) {
    const oldest = await prisma.rateLimitHit.findFirst({
      where: { bucket, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const resetAt = (oldest?.createdAt.getTime() ?? Date.now()) + rule.windowSeconds * 1000;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  }

  await prisma.rateLimitHit.create({ data: { bucket } });
  void maybePrune();
  return { allowed: true, remaining: rule.limit - used - 1, retryAfterSeconds: 0 };
}

/** Throws AppError('RATE_LIMITED') when the caller is over the limit. */
export async function enforceRateLimit(rule: RateLimitRule, identity: string): Promise<void> {
  const result = await checkRateLimit(rule, identity);
  if (!result.allowed) {
    throw new AppError(
      'RATE_LIMITED',
      `Bohat zyada requests. ${result.retryAfterSeconds} seconds baad dobara koshish karein.`,
      { context: { rule: rule.name, retryAfterSeconds: result.retryAfterSeconds } },
    );
  }
}
