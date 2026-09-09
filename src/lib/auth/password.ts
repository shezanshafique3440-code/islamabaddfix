import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * bcrypt with cost 12. Chosen over argon2 because it needs no native build
 * step, which keeps the Docker image and serverless bundles simple; cost 12 is
 * ~250ms on the target hardware, an acceptable brute-force ceiling.
 */
const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy: length does the heavy lifting, plus a mixed-character
 * requirement and a block list of the passwords that actually get used.
 */
const BLOCKED = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'islamabad',
  'pakistan1',
  'admin123',
  'letmein1',
]);

export const passwordSchema = z
  .string()
  .min(10, 'Password kam az kam 10 characters ka hona chahiye.')
  .max(128, 'Password 128 characters se zyada nahi ho sakta.')
  .refine((v) => /[a-z]/.test(v) && /[A-Z0-9]/.test(v), {
    message: 'Password mein choti aur bari letters ya numbers dono hone chahiye.',
  })
  .refine((v) => !BLOCKED.has(v.toLowerCase()), {
    message: 'Yeh password bohat aam hai. Koi mazboot password chunein.',
  });

/**
 * Constant-time-ish dummy verification. Called when an account does not exist
 * so that "unknown email" and "wrong password" take similar wall-clock time.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO6Vpr4V0i4tGXQ0uUUXTGSGZzZ2K4uJa';
export async function dummyVerify(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
