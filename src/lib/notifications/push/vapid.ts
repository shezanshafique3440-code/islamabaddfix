import { createECDH } from 'node:crypto';
import { SignJWT, importJWK } from 'jose';
import { env } from '../../env';

/**
 * VAPID — the server's identity to a push service (RFC 8292).
 *
 * Unlike every other integration in this codebase, push needs no account with
 * anybody. The keypair below is generated once with `npm run vapid:keys` and
 * kept in the environment; the push services accept it because it signs a JWT,
 * not because someone issued it. That is what makes push the one channel this
 * deployment can turn on entirely by itself.
 *
 * The subject tells a push service who to contact if this server misbehaves.
 * It has to be a mailto: or https: URL — they reject anything else.
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidKeys(): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? `mailto:${env.SEED_ADMIN_EMAIL ?? 'ops@example.com'}`,
  };
}

/** Generate a fresh VAPID keypair. Used by the CLI script, never at runtime. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ec = createECDH('prime256v1');
  ec.generateKeys();
  return {
    publicKey: ec.getPublicKey().toString('base64url'),
    privateKey: ec.getPrivateKey().toString('base64url'),
  };
}

/** The raw keys as a JWK, which is what `jose` signs with. */
function toJwk(keys: VapidKeys) {
  const publicKey = Buffer.from(keys.publicKey, 'base64url');
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 point.');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: publicKey.subarray(1, 33).toString('base64url'),
    y: publicKey.subarray(33, 65).toString('base64url'),
    d: Buffer.from(keys.privateKey, 'base64url').toString('base64url'),
    ext: true,
  };
}

/**
 * The `Authorization` header for one push request.
 *
 * The audience is the *origin* of the endpoint, not the endpoint itself — a
 * token minted for Google's push service is not valid at Mozilla's. Twelve
 * hours is well inside the 24-hour ceiling the spec allows.
 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;
  const key = await importJWK(toJwk(keys), 'ES256');

  const jwt = await new SignJWT({})
    .setProtectedHeader({ typ: 'JWT', alg: 'ES256' })
    .setAudience(audience)
    .setExpirationTime('12h')
    .setSubject(keys.subject)
    .sign(key);

  return `vapid t=${jwt}, k=${keys.publicKey}`;
}
