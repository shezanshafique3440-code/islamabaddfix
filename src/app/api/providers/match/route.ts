import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { matchQuerySchema } from '@/lib/validation/schemas';
import { findMatchingProviders } from '@/lib/matching/engine';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { fileUrl } from '@/lib/storage';
import { isStaff } from '@/lib/auth/rbac';

/**
 * Providers available for a specific job — step 6 of the booking wizard.
 *
 * Requires authentication because the address it resolves belongs to the caller.
 * The response omits the score breakdown for customers: it is an internal
 * ranking detail, and showing it invites gaming. Staff do get it, for tuning.
 */
export const POST = route(async (request) => {
  const ctx = await requireAuth();
  const input = await parseJson(request, matchQuerySchema);

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, isActive: true, deletedAt: null },
    select: { id: true, isEmergencyEnabled: true, name: true },
  });
  if (!service) throw new AppError('NOT_FOUND', 'Service available nahi hai.');
  if (input.isEmergency && !service.isEmergencyEnabled) {
    throw new AppError(
      'BOOKING_NOT_AVAILABLE',
      'Is service ke liye emergency booking available nahi hai.',
    );
  }

  // The address is resolved through the caller's own rows, so one customer
  // cannot probe provider availability against someone else's home.
  let zoneId = input.zoneId ?? null;
  let location: { latitude: number; longitude: number } | null = null;
  if (input.addressId) {
    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId: ctx.user.id, deletedAt: null },
      select: { zoneId: true, latitude: true, longitude: true },
    });
    if (!address) throw new AppError('NOT_FOUND', 'Address nahi mila.');
    zoneId = address.zoneId;
    if (address.latitude != null && address.longitude != null) {
      location = { latitude: address.latitude, longitude: address.longitude };
    }
  }

  const candidates = await findMatchingProviders({
    serviceId: service.id,
    zoneId,
    location,
    scheduledFor: input.scheduledFor ?? null,
    urgency: input.isEmergency ? 'EMERGENCY' : 'NORMAL',
    limit: input.limit,
  });

  const showBreakdown = isStaff(ctx.role);
  return ok(
    candidates.map((candidate) => ({
      providerId: candidate.providerId,
      businessName: candidate.businessName,
      slug: candidate.slug,
      headline: candidate.headline,
      photoUrl: candidate.profilePhotoId ? fileUrl(candidate.profilePhotoId) : null,
      yearsExperience: candidate.yearsExperience,
      ratingAverage: candidate.ratingAverage,
      ratingCount: candidate.ratingCount,
      completedJobs: candidate.completedJobs,
      avgResponseMinutes: candidate.avgResponseMinutes,
      startingPricePaisa: candidate.startingPricePaisa,
      emergencyAvailable: candidate.emergencyAvailable,
      emergencyFeePaisa: candidate.emergencyFeePaisa,
      verifiedIdentity: candidate.verifiedIdentity,
      verifiedPhone: candidate.verifiedPhone,
      distanceKm: candidate.distanceKm,
      // Flagged so the UI can say "approx." rather than implying GPS precision.
      distanceIsEstimate: candidate.distanceIsEstimate,
      ...(showBreakdown ? { score: candidate.score, breakdown: candidate.breakdown } : {}),
    })),
    { total: candidates.length, emergency: input.isEmergency },
  );
});
