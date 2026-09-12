import { createHash } from 'crypto';
import type { FilePurpose, FileVisibility, UploadedFile } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { buildStorageKey, localDriver } from './drivers/local';
import { s3Driver } from './drivers/s3';
import { CONSTRAINTS, validateUpload, type UploadConstraints } from './validation';
import type { StorageDriver } from './types';

export * from './validation';
export type { StorageDriver } from './types';

const drivers: Record<string, StorageDriver> = { local: localDriver, s3: s3Driver };

export function storage(): StorageDriver {
  const driver = drivers[env.STORAGE_DRIVER];
  if (!driver) throw new AppError('INTEGRATION_NOT_CONFIGURED', 'Storage driver unknown hai.');
  return driver;
}

/** Which constraint set applies to each upload purpose. */
const PURPOSE_CONSTRAINTS: Record<FilePurpose, UploadConstraints> = {
  BOOKING_EVIDENCE: CONSTRAINTS.media,
  COMPLETION_PROOF: CONSTRAINTS.media,
  PROVIDER_PROFILE_PHOTO: CONSTRAINTS.image,
  PROVIDER_DOCUMENT: CONSTRAINTS.document,
  DISPUTE_EVIDENCE: CONSTRAINTS.media,
  GUARANTEE_EVIDENCE: CONSTRAINTS.media,
  SUPPORT_ATTACHMENT: CONSTRAINTS.document,
  CATEGORY_IMAGE: CONSTRAINTS.image,
};

/**
 * Visibility per purpose. Verification documents and dispute evidence are
 * PRIVATE without exception — that decision does not belong to the caller.
 */
const PURPOSE_VISIBILITY: Record<FilePurpose, FileVisibility> = {
  BOOKING_EVIDENCE: 'PRIVATE',
  COMPLETION_PROOF: 'PRIVATE',
  PROVIDER_PROFILE_PHOTO: 'PUBLIC',
  PROVIDER_DOCUMENT: 'PRIVATE',
  DISPUTE_EVIDENCE: 'PRIVATE',
  GUARANTEE_EVIDENCE: 'PRIVATE',
  SUPPORT_ATTACHMENT: 'PRIVATE',
  CATEGORY_IMAGE: 'PUBLIC',
};

export interface StoreFileInput {
  file: { name: string; type: string; size: number };
  buffer: Buffer;
  purpose: FilePurpose;
  ownerId: string;
  bookingId?: string;
  providerId?: string;
  disputeId?: string;
  guaranteeClaimId?: string;
  ticketId?: string;
  isCompletionProof?: boolean;
}

/**
 * Validate, persist to object storage, then record metadata in Postgres.
 *
 * Bytes never go into the database — only the storage key and metadata. If the
 * metadata write fails the object is removed again so we do not accumulate
 * orphans.
 */
export async function storeFile(input: StoreFileInput): Promise<UploadedFile> {
  const constraints = PURPOSE_CONSTRAINTS[input.purpose];
  const { mimeType } = validateUpload(input.file, input.buffer, constraints);

  const visibility = PURPOSE_VISIBILITY[input.purpose];
  const storageKey = buildStorageKey({
    purpose: input.purpose,
    originalName: input.file.name,
    ownerId: input.ownerId,
  });
  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  await storage().put({
    key: storageKey,
    body: input.buffer,
    contentType: mimeType,
    isPublic: visibility === 'PUBLIC',
  });

  try {
    return await prisma.uploadedFile.create({
      data: {
        storageKey,
        driver: storage().name,
        purpose: input.purpose,
        visibility,
        mimeType,
        sizeBytes: input.buffer.length,
        originalName: sanitizeName(input.file.name),
        checksumSha256: checksum,
        ownerId: input.ownerId,
        bookingId: input.bookingId ?? null,
        providerId: input.providerId ?? null,
        disputeId: input.disputeId ?? null,
        guaranteeClaimId: input.guaranteeClaimId ?? null,
        ticketId: input.ticketId ?? null,
        isCompletionProof: input.isCompletionProof ?? false,
      },
    });
  } catch (error) {
    await storage()
      .delete(storageKey)
      .catch(() => {});
    throw error;
  }
}

/** Strip path components and control characters from the stored display name. */
function sanitizeName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 160);
}

export async function readFileBytes(
  file: UploadedFile,
): Promise<{ body: Buffer; contentType: string }> {
  return storage().get(file.storageKey);
}

/** Soft-delete metadata and remove the object. */
export async function deleteFile(fileId: string): Promise<void> {
  const file = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
  if (!file) return;
  await prisma.uploadedFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  await storage()
    .delete(file.storageKey)
    .catch((error: unknown) => {
      console.error('[storage] object delete failed', { fileId, error });
    });
}

/** The only URL shape clients ever see. Access control lives in the route. */
export const fileUrl = (fileId: string): string => `/api/files/${fileId}`;
