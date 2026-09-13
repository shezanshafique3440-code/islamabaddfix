import { randomBytes, randomUUID } from 'crypto';

/**
 * Human-facing references. Crockford-style alphabet: no I/L/O/U/0/1 so they
 * can be read over the phone without ambiguity — these get dictated to
 * technicians and customers constantly.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export const bookingReference = () => `IFX-${randomCode(6)}`;
export const disputeReference = () => `DSP-${randomCode(6)}`;
export const guaranteeReference = () => `GUA-${randomCode(6)}`;
export const ticketReference = () => `SUP-${randomCode(6)}`;
export const membershipReference = () => `MEM-${randomCode(6)}`;

export const uuid = () => randomUUID();

/** URL-safe slug. Falls back to a random suffix when the input is unusable. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `item-${randomCode(4).toLowerCase()}`;
}

/**
 * Slugify and guarantee uniqueness against an existence check.
 * Used for provider slugs, category slugs and service slugs.
 */
export async function uniqueSlug(
  input: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(input);
  if (!(await exists(base))) return base;
  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${randomCode(5).toLowerCase()}`;
}
