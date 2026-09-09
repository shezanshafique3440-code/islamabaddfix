import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, integrations } from '../../env';
import { AppError } from '../../errors';
import type { PutObjectInput, StorageDriver } from '../types';

/**
 * S3-compatible driver — works against AWS S3, MinIO, Backblaze B2 and the
 * like. Path-style addressing is the default because MinIO needs it.
 *
 * Private objects are never given a public ACL; they are read either through
 * the authorized API route or a short-lived presigned URL.
 */
let client: S3Client | undefined;

function s3(): S3Client {
  if (!integrations.storage.configured || env.STORAGE_DRIVER !== 's3') {
    throw new AppError(
      'INTEGRATION_NOT_CONFIGURED',
      'Object storage (S3) configured nahi hai. STORAGE_* variables set karein.',
    );
  }
  client ??= new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY!,
      secretAccessKey: env.STORAGE_SECRET_KEY!,
    },
  });
  return client;
}

export const s3Driver: StorageDriver = {
  name: 's3',
  isConfigured: () =>
    env.STORAGE_DRIVER === 's3' &&
    Boolean(env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY && env.STORAGE_ENDPOINT),

  async put({ key, body, contentType, isPublic }: PutObjectInput) {
    await s3().send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Only explicitly public assets get a public-read ACL.
        ...(isPublic ? { ACL: 'public-read' as const } : {}),
      }),
    );
  },

  async get(key: string) {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
    );
    if (!result.Body) throw new AppError('NOT_FOUND', 'File storage mein nahi mili.');
    const bytes = await result.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  },

  async delete(key: string) {
    await s3().send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  },

  async signedUrl(key: string, expiresInSeconds: number) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },
};
