import { beforeEach, describe, expect, it } from 'vitest';
import { assessPhoto, visionStatus } from '@/lib/ai/vision';
import { storeFile } from '@/lib/storage';
import { createUser, db } from './helpers';
import { truncateAll } from './setup';

/** A one-pixel PNG — enough to be a real, readable stored file. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function upload(ownerId: string) {
  return storeFile({
    file: { name: 'photo.png', type: 'image/png', size: PNG.byteLength },
    buffer: PNG,
    purpose: 'BOOKING_EVIDENCE',
    ownerId,
  });
}

describe('photo assessment', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('is honestly reported as unconfigured on a deployment without a vision model', () => {
    expect(visionStatus().configured).toBe(false);
  });

  it('says why there is no assessment rather than returning an empty one', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const file = await upload(customer.id);

    const result = await assessPhoto({ fileId: file.id, requesterId: customer.id });
    expect(result.available).toBe(false);
    expect(result.assessment).toBeNull();
    expect(result.unavailableReason).toMatch(/no vision model is configured/i);
    // And it is clear the photo was not wasted.
    expect(result.unavailableReason).toMatch(/technician still sees/i);
  });

  it('carries the diagnosis disclaimer even when it has nothing to say', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const file = await upload(customer.id);

    const result = await assessPhoto({ fileId: file.id, requesterId: customer.id });
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it('refuses a file type no vision model accepts', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    // HEIC and video are accepted as evidence but cannot be assessed — an
    // iPhone photo is the common case, so the reason has to be specific.
    const file = await upload(customer.id);
    await db.uploadedFile.update({
      where: { id: file.id },
      data: { mimeType: 'image/heic' },
    });

    const result = await assessPhoto({ fileId: file.id, requesterId: customer.id });
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toMatch(/JPEG, PNG and WebP/);
  });

  it('will not assess a photo belonging to somebody else', async () => {
    const owner = await createUser({ role: 'CUSTOMER' });
    const stranger = await createUser({ role: 'CUSTOMER' });
    const file = await upload(owner.id);

    await expect(assessPhoto({ fileId: file.id, requesterId: stranger.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('will not assess a soft-deleted photo', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const file = await upload(customer.id);
    await db.uploadedFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });

    await expect(assessPhoto({ fileId: file.id, requesterId: customer.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
