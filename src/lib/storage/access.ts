import type { Role, UploadedFile } from '@prisma/client';
import { prisma } from '../db';
import { isStaff } from '../auth/rbac';

/**
 * Who may read a given file.
 *
 * Deny by default. Every allow is an explicit, justified relationship:
 *  - Staff may read anything (they arbitrate disputes).
 *  - The uploader may read their own file.
 *  - Booking media is visible to the booking's customer and assigned provider.
 *  - Provider verification documents are visible to that provider and staff
 *    only, never to customers.
 *  - Public assets (profile photos, category art) need no relationship.
 */
export async function canReadFile(
  file: UploadedFile,
  viewer: { userId: string; role: Role; providerId?: string } | null,
): Promise<boolean> {
  if (file.deletedAt) return false;
  if (file.visibility === 'PUBLIC') return true;
  if (!viewer) return false;
  if (isStaff(viewer.role)) return true;
  if (file.ownerId === viewer.userId) return true;

  if (file.purpose === 'PROVIDER_DOCUMENT' || file.purpose === 'PROVIDER_PROFILE_PHOTO') {
    return Boolean(viewer.providerId) && file.providerId === viewer.providerId;
  }

  if (file.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: file.bookingId },
      select: { customerId: true, providerId: true },
    });
    if (!booking) return false;
    if (booking.customerId === viewer.userId) return true;
    if (viewer.providerId && booking.providerId === viewer.providerId) return true;
    return false;
  }

  if (file.disputeId) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: file.disputeId },
      select: { booking: { select: { customerId: true, providerId: true } } },
    });
    if (!dispute) return false;
    if (dispute.booking.customerId === viewer.userId) return true;
    if (viewer.providerId && dispute.booking.providerId === viewer.providerId) return true;
    return false;
  }

  if (file.guaranteeClaimId) {
    const claim = await prisma.guaranteeClaim.findUnique({
      where: { id: file.guaranteeClaimId },
      select: { booking: { select: { customerId: true, providerId: true } } },
    });
    if (!claim) return false;
    if (claim.booking.customerId === viewer.userId) return true;
    if (viewer.providerId && claim.booking.providerId === viewer.providerId) return true;
    return false;
  }

  if (file.ticketId) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: file.ticketId },
      select: { requesterId: true },
    });
    return ticket?.requesterId === viewer.userId;
  }

  return false;
}
