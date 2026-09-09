import { createHash, randomBytes, randomUUID } from 'crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Role } from '@prisma/client';
import { env } from '../env';
import { AppError } from '../errors';

/**
 * Two-token scheme:
 *  - Access token: short-lived signed JWT (HS256), carries id/role/version.
 *  - Refresh token: opaque 32-byte random string. Only its SHA-256 is stored.
 *    Refreshing rotates the token; presenting an already-rotated token revokes
 *    the whole family (reuse detection).
 *
 * Both travel as httpOnly, SameSite=Lax cookies. The access token's role claim
 * is a fast path only — privileged handlers re-read the user row.
 */

const ISSUER = 'islamabad-fix';
const AUDIENCE = 'islamabad-fix-app';

let cachedKey: Uint8Array | undefined;
function secretKey(): Uint8Array {
  cachedKey ??= new TextEncoder().encode(env.AUTH_SECRET);
  return cachedKey;
}

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  role: Role;
  /** Session family, so an access token can be tied back to its refresh chain. */
  fam: string;
}

export async function signAccessToken(params: {
  userId: string;
  role: Role;
  familyId: string;
}): Promise<string> {
  return new SignJWT({ role: params.role, fam: params.familyId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(params.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .setJti(randomUUID())
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
      throw new AppError('UNAUTHENTICATED', 'Session invalid hai. Dobara login karein.');
    }
    return payload as AccessTokenClaims;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const expired =
      error instanceof Error && error.name === 'JWTExpired';
    throw new AppError(
      expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED',
      expired ? 'Session expire ho gaya.' : 'Session invalid hai. Dobara login karein.',
    );
  }
}

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const newFamilyId = () => randomUUID();
