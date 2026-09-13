import { createHash } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve, sep } from 'path';
import { env } from '../../env';
import { AppError } from '../../errors';
import type { PutObjectInput, StorageDriver } from '../types';

/**
 * Filesystem driver for development and single-node deployments.
 *
 * The storage root sits outside `public/` on purpose: nothing here is
 * web-reachable, so private documents cannot leak through the static handler.
 * Every read goes through the authorized `/api/files/[id]` route.
 */
const root = resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

/** Reject any key that would escape the storage root. */
function safePath(key: string): string {
  const target = resolve(root, normalize(key));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new AppError('FORBIDDEN', 'Invalid storage key.', { context: { key } });
  }
  return target;
}

const CONTENT_TYPE_SIDECAR = '.contenttype';

export const localDriver: StorageDriver = {
  name: 'local',
  isConfigured: () => true,

  async put({ key, body, contentType }: PutObjectInput) {
    const target = safePath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    await writeFile(`${target}${CONTENT_TYPE_SIDECAR}`, contentType, 'utf8');
  },

  async get(key: string) {
    const target = safePath(key);
    try {
      const body = await readFile(target);
      const contentType = await readFile(`${target}${CONTENT_TYPE_SIDECAR}`, 'utf8').catch(
        () => 'application/octet-stream',
      );
      return { body, contentType: contentType.trim() };
    } catch {
      throw new AppError('NOT_FOUND', 'The file was not found in storage.');
    }
  },

  async delete(key: string) {
    const target = safePath(key);
    await unlink(target).catch(() => {});
    await unlink(`${target}${CONTENT_TYPE_SIDECAR}`).catch(() => {});
  },

  async signedUrl() {
    // No direct URL: the local root is not served by the web server.
    return null;
  },
};

/** Deterministic key layout: purpose/yyyy/mm/hash-ish name. */
export function buildStorageKey(params: {
  purpose: string;
  originalName: string;
  ownerId?: string;
}): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const extension = params.originalName.includes('.')
    ? `.${params.originalName.split('.').pop()!.toLowerCase().slice(0, 8)}`
    : '';
  const random = createHash('sha256')
    .update(`${params.ownerId ?? 'anon'}:${params.originalName}:${now.getTime()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 32);
  return join(params.purpose.toLowerCase(), String(year), month, `${random}${extension}`);
}
