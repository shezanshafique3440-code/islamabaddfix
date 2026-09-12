import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238), implemented here rather than
 * pulled in.
 *
 * The algorithm is thirty lines: a counter of 30-second steps, HMAC-SHA1, and
 * the standard dynamic truncation. Every authenticator app agrees on it.
 * Taking a dependency for that means trusting another maintainer with the
 * second factor on accounts that can issue refunds — a worse trade than owning
 * the code.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;

/**
 * How many steps either side of "now" are accepted.
 *
 * One step is ±30 seconds, which absorbs ordinary clock drift on a phone
 * without meaningfully widening the window a stolen code is usable in.
 */
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 160 bits, the size RFC 4226 recommends, rendered as base32 for the apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The code for one 30-second step. */
function codeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  // 8-byte big-endian counter. JavaScript bitwise ops are 32-bit, so the high
  // and low halves are written separately.
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  // Dynamic truncation, RFC 4226 §5.3.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** The code an authenticator app is showing right now. Used by the tests. */
export function currentTotp(secret: string, at: Date = new Date()): string {
  return codeForStep(secret, Math.floor(at.getTime() / 1000 / STEP_SECONDS));
}

/**
 * Check a code, allowing one step of clock drift either way.
 *
 * Returns the step it matched, so the caller can refuse a code that has already
 * been used — without that, a code is valid for its whole window to anybody who
 * sees it over the user's shoulder.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { at?: Date; lastUsedStep?: number | null } = {},
): { valid: boolean; step?: number } {
  const candidate = code.replace(/\D/g, '');
  if (candidate.length !== DIGITS) return { valid: false };

  const now = Math.floor((options.at ?? new Date()).getTime() / 1000 / STEP_SECONDS);

  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
    const step = now + drift;
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;

    const expected = Buffer.from(codeForStep(secret, step));
    const given = Buffer.from(candidate);
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return { valid: true, step };
    }
  }
  return { valid: false };
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The secret is in the URI, so this string is as sensitive as the secret — it
 * is shown once during setup and never stored or logged.
 */
export function totpUri(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Recovery codes, for the phone that fell in a drain.
 *
 * Ten single-use codes, stored hashed like any other secret. Without these the
 * second factor is a way to lock an administrator out of their own platform.
 */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
