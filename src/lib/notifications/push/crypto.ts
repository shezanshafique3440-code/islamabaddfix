import { createCipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';

/**
 * Web Push payload encryption — RFC 8291, `aes128gcm`.
 *
 * Written out rather than taken as a dependency, for the same reason the TOTP
 * implementation is: it is a short, fully specified algorithm, and the shape of
 * it is worth being able to read. Every step below maps to a named step in the
 * RFC.
 *
 * The important property is that the browser's own keys are mixed into the key
 * derivation. A payload encrypted for one subscription cannot be replayed
 * against another, and the push service in the middle — Google, Mozilla, Apple
 * — carries the bytes without being able to read them.
 */

const hmac = (key: Buffer, data: Buffer): Buffer => createHmac('sha256', key).update(data).digest();

/** HKDF in the two-step extract/expand form the RFC uses, single-block output. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

const contentEncodingInfo = (type: string): Buffer =>
  Buffer.from(`Content-Encoding: ${type}\0`, 'utf8');

/** The record size we advertise. One record is always enough for a notification. */
const RECORD_SIZE = 4096;

/**
 * Longest plaintext that fits one record: the record size, less the 16-byte GCM
 * tag and the one-byte padding delimiter.
 */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - 16 - 1;

export interface SubscriptionKeys {
  /** The browser's public key, base64url, as an uncompressed P-256 point. */
  p256dh: string;
  /** The browser's auth secret, base64url, 16 bytes. */
  auth: string;
}

/**
 * Encrypt one notification for one subscription.
 *
 * Returns the complete request body: the aes128gcm header (salt, record size
 * and our ephemeral public key) followed by the single ciphertext record.
 */
export function encryptPushPayload(plaintext: string, keys: SubscriptionKeys): Buffer {
  const uaPublic = Buffer.from(keys.p256dh, 'base64url');
  const authSecret = Buffer.from(keys.auth, 'base64url');

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('Subscription p256dh is not an uncompressed P-256 point.');
  }
  if (authSecret.length !== 16) {
    throw new Error('Subscription auth secret is not 16 bytes.');
  }

  const body = Buffer.from(plaintext, 'utf8');
  if (body.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Push payload is ${body.length} bytes; the limit is ${MAX_PAYLOAD_BYTES}.`);
  }

  // A fresh key pair per message, so the same notification to two devices
  // shares nothing.
  const ephemeral = createECDH('prime256v1');
  ephemeral.generateKeys();
  const asPublic = ephemeral.getPublicKey();
  const sharedSecret = ephemeral.computeSecret(uaPublic);

  // Binding both public keys into the derivation is what ties the ciphertext to
  // this one subscription.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = randomBytes(16);
  const contentKey = hkdf(salt, ikm, contentEncodingInfo('aes128gcm'), 16);
  const nonce = hkdf(salt, ikm, contentEncodingInfo('nonce'), 12);

  // 0x02 marks the last record. Nothing is appended after it, so the record is
  // exactly as long as the message — padding it to 4096 would only cost
  // bandwidth on a connection that has little of it.
  const padded = Buffer.concat([body, Buffer.from([2])]);

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  // Header: salt(16) || record size(4) || key length(1) || our public key.
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);

  return Buffer.concat([header, asPublic, ciphertext]);
}
