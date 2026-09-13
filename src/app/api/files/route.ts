import { z } from 'zod';
import { created, rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { storeFile } from '@/lib/storage';
import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { isStaff } from '@/lib/auth/rbac';

/**
 * Multipart upload.
 *
 * Authorization happens before a single byte is written:
 *  - the purpose must be one this role is allowed to upload
 *  - a booking-scoped upload must reference a booking the caller is party to
 *  - a provider document must belong to the caller's own provider profile
 *
 * Content validation (size, MIME, extension, magic bytes) happens inside
 * storeFile, so an attacker cannot get a script stored as a .jpg.
 */
const PURPOSES = [
  'BOOKING_EVIDENCE',
  'COMPLETION_PROOF',
  'PROVIDER_PROFILE_PHOTO',
  'PROVIDER_DOCUMENT',
  'DISPUTE_EVIDENCE',
  'GUARANTEE_EVIDENCE',
  'SUPPORT_ATTACHMENT',
] as const;

const fieldsSchema = z.object({
  purpose: z.enum(PURPOSES),
  bookingId: z.string().uuid().optional(),
});

/** Which roles may upload which purposes. */
const ROLE_PURPOSES: Record<string, readonly string[]> = {
  CUSTOMER: ['BOOKING_EVIDENCE', 'DISPUTE_EVIDENCE', 'GUARANTEE_EVIDENCE', 'SUPPORT_ATTACHMENT'],
  PROVIDER: [
    'COMPLETION_PROOF',
    'PROVIDER_PROFILE_PHOTO',
    'PROVIDER_DOCUMENT',
    'SUPPORT_ATTACHMENT',
  ],
};

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.upload, rateLimitIdentity(request, ctx.user.id));

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'multipart/form-data expected.');
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_ERROR', 'No file was attached.');
  }

  const fields = fieldsSchema.parse({
    purpose: form.get('purpose'),
    bookingId: form.get('bookingId') ?? undefined,
  });

  const allowed = isStaff(ctx.role) ? PURPOSES : (ROLE_PURPOSES[ctx.role] ?? []);
  if (!allowed.includes(fields.purpose)) {
    throw new AppError('FORBIDDEN', 'You cannot upload that kind of file.');
  }

  // Booking-scoped uploads must reference a booking the caller is party to.
  if (fields.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: fields.bookingId },
      select: { id: true, customerId: true, providerId: true },
    });
    if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
    const isCustomer = booking.customerId === ctx.user.id;
    const isAssignedProvider =
      ctx.providerId !== undefined && booking.providerId === ctx.providerId;
    if (!isCustomer && !isAssignedProvider && !isStaff(ctx.role)) {
      throw new AppError('FORBIDDEN', 'This booking is not yours.');
    }
    if (fields.purpose === 'COMPLETION_PROOF' && !isAssignedProvider) {
      throw new AppError('FORBIDDEN', 'Only the assigned technician can upload completion photos.');
    }
  }

  if (fields.purpose === 'PROVIDER_DOCUMENT' || fields.purpose === 'PROVIDER_PROFILE_PHOTO') {
    if (!ctx.providerId) {
      throw new AppError('NOT_FOUND', 'Provider profile not found. Complete onboarding first.');
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile({
    file: { name: file.name, type: file.type, size: file.size },
    buffer,
    purpose: fields.purpose,
    ownerId: ctx.user.id,
    bookingId: fields.bookingId,
    providerId:
      fields.purpose === 'PROVIDER_DOCUMENT' || fields.purpose === 'PROVIDER_PROFILE_PHOTO'
        ? ctx.providerId
        : undefined,
    isCompletionProof: fields.purpose === 'COMPLETION_PROOF',
  });

  // A new profile photo becomes the provider's current one immediately.
  if (fields.purpose === 'PROVIDER_PROFILE_PHOTO' && ctx.providerId) {
    await prisma.providerProfile.update({
      where: { id: ctx.providerId },
      data: { profilePhotoId: stored.id },
    });
  }

  return created({
    id: stored.id,
    url: `/api/files/${stored.id}`,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    originalName: stored.originalName,
    purpose: stored.purpose,
  });
});
