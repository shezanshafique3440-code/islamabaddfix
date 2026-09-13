import type { Booking, BookingUrgency, Prisma, Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { bookingReference } from '../ids';
import { getSetting } from '../settings';
import { notify, notifyMany, NOTIFICATION_EVENTS } from '../notifications';
import { createOffers, findMatchingProviders, recordOfferResponse } from '../matching/engine';
import { activeBenefitsFor } from '../memberships';
import { formatPaisa } from '../money';
import { formatDateTime } from '../utils';
import { transitionBooking } from './transition';
import { ACTIVE_STATUSES, WORKLOAD_STATUSES } from './state-machine';

/**
 * Booking lifecycle orchestration.
 *
 * Everything that creates or advances a booking lives here so the API routes
 * stay thin. Rules enforced in this module — not in the client:
 *  - the customer owns the address they book against
 *  - the service is active and, for emergencies, emergency-enabled
 *  - a directly chosen provider is verified and actually offers the service
 *  - the schedule respects the configured lead-time window
 *  - emergency fees are read from the provider/platform, never from the request
 */

export interface CreateBookingInput {
  customerId: string;
  serviceId: string;
  addressId: string;
  problemDescription: string;
  /** Chosen by the customer. When absent the job is fanned out to top matches. */
  providerId?: string | null;
  scheduledFor?: Date | null;
  urgency?: BookingUrgency;
  isEmergency?: boolean;
  customerNotes?: string;
  /** Ids of files already uploaded by this customer, attached on creation. */
  fileIds?: string[];
  /** Structured output of the intake assistant, stored for the technician. */
  intakeSummary?: Record<string, unknown> | null;
  promoCode?: string;
}

export interface CreateBookingResult {
  booking: Booking;
  /** Providers notified when no specific provider was chosen. */
  offeredProviderIds: string[];
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const [minLeadMinutes, maxLeadDays, emergencyEnabled, defaultEmergencyFee, fanout, offerExpiry] =
    await Promise.all([
      getSetting('booking.minLeadMinutes'),
      getSetting('booking.maxLeadDays'),
      getSetting('emergency.enabled'),
      getSetting('emergency.defaultFeePaisa'),
      getSetting('booking.offerFanout'),
      getSetting('booking.offerExpiryMinutes'),
    ]);

  const isEmergency = Boolean(input.isEmergency);
  const urgency: BookingUrgency = isEmergency ? 'EMERGENCY' : (input.urgency ?? 'NORMAL');

  if (isEmergency && !emergencyEnabled) {
    throw new AppError(
      'BOOKING_NOT_AVAILABLE',
      'Emergency booking is switched off right now. Please book a normal visit or contact support.',
    );
  }

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, isActive: true, deletedAt: null },
    include: { category: { select: { isActive: true, name: true } } },
  });
  if (!service || !service.category.isActive) {
    throw new AppError('NOT_FOUND', 'This service is not available right now.');
  }
  if (isEmergency && !service.isEmergencyEnabled) {
    throw new AppError(
      'BOOKING_NOT_AVAILABLE',
      'Emergency booking is not available for this service.',
    );
  }

  // The address must belong to the customer — this is the check that stops one
  // customer booking work at another's home.
  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId: input.customerId, deletedAt: null },
    include: { zone: { select: { id: true, isActive: true, name: true } } },
  });
  if (!address) throw new AppError('NOT_FOUND', 'That address is not on your account.');

  const scheduledFor = input.scheduledFor ?? null;
  if (scheduledFor) {
    assertScheduleWindow(scheduledFor, { minLeadMinutes, maxLeadDays, isEmergency });
  } else if (!isEmergency) {
    throw new AppError('VALIDATION_ERROR', 'Please choose a date and time for the visit.');
  }

  // Validate the chosen provider before creating anything.
  let chosenProvider: { id: string; userId: string; emergencyFeePaisa: number } | null = null;
  if (input.providerId) {
    chosenProvider = await assertProviderCanTake({
      providerId: input.providerId,
      serviceId: service.id,
      zoneId: address.zoneId,
      isEmergency,
    });
  }

  const emergencyFeePaisa = isEmergency
    ? chosenProvider?.emergencyFeePaisa || defaultEmergencyFee
    : 0;

  const promo = input.promoCode ? await resolvePromoCode(input.promoCode, input.customerId) : null;

  // A member's request goes out to a wider first wave. Nothing queues in this
  // system, so this — not a place in a line — is what priority actually means.
  const benefits = await activeBenefitsFor(input.customerId);
  const effectiveFanout = fanout + (benefits?.priorityFanoutBonus ?? 0);

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        reference: bookingReference(),
        customerId: input.customerId,
        serviceId: service.id,
        addressId: address.id,
        providerId: chosenProvider?.id ?? null,
        status: 'PENDING',
        urgency,
        isEmergency,
        problemDescription: input.problemDescription.trim(),
        customerNotes: input.customerNotes?.trim() || null,
        scheduledFor,
        scheduledWindowMinutes: service.estimatedMinutes,
        emergencyFeePaisa,
        promoCodeId: promo?.id ?? null,
        intakeSummary: (input.intakeSummary ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await tx.bookingStatusHistory.create({
      data: {
        bookingId: created.id,
        fromStatus: null,
        toStatus: 'PENDING',
        changedByUserId: input.customerId,
        changedByRole: 'CUSTOMER',
        reason: 'Booking created',
      },
    });

    // Attach previously uploaded evidence, but only files this customer owns and
    // that are not already tied to another booking.
    if (input.fileIds?.length) {
      await tx.uploadedFile.updateMany({
        where: {
          id: { in: input.fileIds },
          ownerId: input.customerId,
          bookingId: null,
          purpose: 'BOOKING_EVIDENCE',
          deletedAt: null,
        },
        data: { bookingId: created.id },
      });
    }

    await tx.customerProfile.updateMany({
      where: { userId: input.customerId },
      data: { totalBookings: { increment: 1 } },
    });

    return created;
  });

  // ---- fan out ------------------------------------------------------------
  const offeredProviderIds: string[] = [];

  if (chosenProvider) {
    await prisma.bookingOffer.create({
      data: {
        bookingId: booking.id,
        providerId: chosenProvider.id,
        expiresAt: offerDeadline(offerExpiry),
      },
    });
    await prisma.providerProfile.update({
      where: { id: chosenProvider.id },
      data: { offeredJobs: { increment: 1 } },
    });
    offeredProviderIds.push(chosenProvider.id);

    await transitionBooking({
      bookingId: booking.id,
      to: 'PROVIDER_NOTIFIED',
      actorRole: 'SYSTEM',
      reason: 'Customer selected this provider',
    });

    await notify({
      event: NOTIFICATION_EVENTS.PROVIDER_NOTIFIED,
      userId: chosenProvider.userId,
      title: isEmergency ? 'Emergency job request' : 'New job request',
      body: `${service.name} — ${address.zone?.name ?? address.city}. ${
        scheduledFor ? formatDateTime(scheduledFor) : 'Right now'
      }`,
      href: `/provider/jobs/${booking.id}`,
      data: { bookingId: booking.id, reference: booking.reference },
    });
  } else {
    const candidates = await findMatchingProviders({
      serviceId: service.id,
      zoneId: address.zoneId,
      location:
        address.latitude != null && address.longitude != null
          ? { latitude: address.latitude, longitude: address.longitude }
          : null,
      scheduledFor,
      urgency,
      limit: effectiveFanout,
    });

    const offered = await createOffers({
      bookingId: booking.id,
      candidates,
      limit: effectiveFanout,
      expiryMinutes: offerExpiry,
    });
    offeredProviderIds.push(...offered.map((o) => o.providerId));

    if (offered.length > 0) {
      await transitionBooking({
        bookingId: booking.id,
        to: 'PROVIDER_NOTIFIED',
        actorRole: 'SYSTEM',
        reason: `Offered to ${offered.length} matched provider(s)`,
        metadata: { providerIds: offeredProviderIds },
      });

      await notifyMany(
        offered.map((o) => o.userId),
        {
          event: NOTIFICATION_EVENTS.PROVIDER_NOTIFIED,
          title: isEmergency ? 'Emergency job request' : 'New job request',
          body: `${service.name} — ${address.zone?.name ?? address.city}. ${
            scheduledFor ? formatDateTime(scheduledFor) : 'Right now'
          }`,
          href: `/provider/jobs/${booking.id}`,
          data: { bookingId: booking.id, reference: booking.reference },
        },
      );
    }
    // No match found: the booking stays PENDING and appears in the admin queue
    // for manual assignment. We do not pretend a technician was found.
  }

  await notify({
    event: NOTIFICATION_EVENTS.BOOKING_CREATED,
    userId: input.customerId,
    title: `Booking confirmed — ${booking.reference}`,
    body:
      offeredProviderIds.length > 0
        ? `Your ${service.name} request has been sent. We're waiting for the technician to respond.`
        : `We have your ${service.name} request and we're finding a technician for you.`,
    href: `/account/bookings/${booking.id}`,
    data: { bookingId: booking.id, reference: booking.reference },
  });

  const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  return { booking: fresh, offeredProviderIds };
}

function offerDeadline(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function assertScheduleWindow(
  scheduledFor: Date,
  options: { minLeadMinutes: number; maxLeadDays: number; isEmergency: boolean },
): void {
  const now = Date.now();
  // Emergencies are by definition "now", so only the ceiling applies.
  const earliest = options.isEmergency ? now : now + options.minLeadMinutes * 60_000;
  const latest = now + options.maxLeadDays * 24 * 60 * 60 * 1000;

  if (scheduledFor.getTime() < earliest) {
    throw new AppError(
      'VALIDATION_ERROR',
      options.isEmergency
        ? 'An emergency cannot be scheduled in the past.'
        : `A booking must be at least ${options.minLeadMinutes} minutes from now.`,
    );
  }
  if (scheduledFor.getTime() > latest) {
    throw new AppError(
      'VALIDATION_ERROR',
      `A booking cannot be more than ${options.maxLeadDays} days ahead.`,
    );
  }
}

/**
 * Can this provider take this job? Used both when a customer picks a provider
 * and when a provider accepts an offer.
 */
export async function assertProviderCanTake(params: {
  providerId: string;
  serviceId: string;
  zoneId?: string | null;
  isEmergency: boolean;
}): Promise<{ id: string; userId: string; emergencyFeePaisa: number }> {
  const provider = await prisma.providerProfile.findFirst({
    where: { id: params.providerId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      status: true,
      emergencyAvailable: true,
      emergencyFeePaisa: true,
      maxActiveJobs: true,
      user: { select: { isActive: true, deletedAt: true } },
      services: { where: { serviceId: params.serviceId, isEnabled: true }, select: { id: true } },
      serviceAreas: params.zoneId
        ? { where: { zoneId: params.zoneId }, select: { id: true } }
        : false,
      _count: { select: { bookings: { where: { status: { in: [...WORKLOAD_STATUSES] } } } } },
    },
  });

  if (!provider || !provider.user.isActive || provider.user.deletedAt) {
    throw new AppError('NOT_FOUND', 'That technician is not available.');
  }
  if (provider.status === 'SUSPENDED') {
    throw new AppError('PROVIDER_SUSPENDED', 'That technician is currently suspended.');
  }
  if (provider.status !== 'VERIFIED') {
    throw new AppError(
      'PROVIDER_NOT_VERIFIED',
      'Only verified technicians can take public bookings.',
    );
  }
  if (provider.services.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'That technician does not offer this service.');
  }
  if (params.zoneId && Array.isArray(provider.serviceAreas) && provider.serviceAreas.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'That technician does not cover this area.');
  }
  if (params.isEmergency && !provider.emergencyAvailable) {
    throw new AppError('VALIDATION_ERROR', 'That technician does not take emergency jobs.');
  }
  if (provider._count.bookings >= provider.maxActiveJobs) {
    throw new AppError(
      'PROVIDER_AT_CAPACITY',
      'That technician is fully booked right now. Please choose another.',
    );
  }

  return {
    id: provider.id,
    userId: provider.userId,
    emergencyFeePaisa: provider.emergencyFeePaisa,
  };
}

/** A provider accepting a job they were offered. */
export async function acceptBooking(params: {
  bookingId: string;
  providerId: string;
  actorUserId: string;
}): Promise<Booking> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: {
      service: { select: { id: true, name: true, requiresInspection: true } },
      address: { select: { zoneId: true } },
      offers: { where: { providerId: params.providerId }, select: { id: true } },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');

  // A provider may only accept a job they were actually offered.
  if (booking.offers.length === 0) {
    throw new AppError('FORBIDDEN', 'This job was not offered to you.');
  }
  if (booking.providerId && booking.providerId !== params.providerId) {
    throw new AppError('BOOKING_NOT_AVAILABLE', 'Another technician has already taken this job.');
  }

  await assertProviderCanTake({
    providerId: params.providerId,
    serviceId: booking.serviceId,
    zoneId: booking.address.zoneId,
    isEmergency: booking.isEmergency,
  });

  const result = await transitionBooking({
    bookingId: booking.id,
    to: 'ACCEPTED',
    actorRole: 'PROVIDER',
    actorUserId: params.actorUserId,
    patch: { provider: { connect: { id: params.providerId } } },
  });

  await recordOfferResponse({
    bookingId: booking.id,
    providerId: params.providerId,
    accepted: true,
  });

  // Everyone else who was offered this job should stop seeing it.
  await prisma.bookingOffer.updateMany({
    where: { bookingId: booking.id, providerId: { not: params.providerId }, respondedAt: null },
    data: { respondedAt: new Date(), accepted: false, declineReason: 'taken_by_other_provider' },
  });

  const provider = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: params.providerId },
    select: { businessName: true },
  });

  await notify({
    event: NOTIFICATION_EVENTS.BOOKING_ACCEPTED,
    userId: booking.customerId,
    title: 'A technician has accepted your booking',
    body: `${provider.businessName} is taking your ${booking.service.name} booking.${
      booking.service.requiresInspection ? ' You will get a quote after the inspection.' : ''
    }`,
    href: `/account/bookings/${booking.id}`,
    data: { bookingId: booking.id },
  });

  return result.booking;
}

/** A provider declining an offer. The booking returns to the matching pool. */
export async function declineBooking(params: {
  bookingId: string;
  providerId: string;
  reason?: string;
}): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: { id: true, status: true, providerId: true },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  if (booking.providerId === params.providerId) {
    throw new AppError(
      'CONFLICT',
      'You have already accepted this job. Use cancel if you can no longer do it.',
    );
  }

  await recordOfferResponse({
    bookingId: params.bookingId,
    providerId: params.providerId,
    accepted: false,
    declineReason: params.reason,
  });

  // If nobody is left considering the job, put it back to PENDING so the admin
  // queue and the next fan-out round pick it up.
  const outstanding = await prisma.bookingOffer.count({
    where: { bookingId: params.bookingId, respondedAt: null },
  });
  if (outstanding === 0 && booking.status === 'PROVIDER_NOTIFIED') {
    await transitionBooking({
      bookingId: params.bookingId,
      to: 'PENDING',
      actorRole: 'SYSTEM',
      reason: 'All offered providers declined or expired',
    });
  }
}

/** Customer or admin cancellation, applying the configured policy. */
export async function cancelBooking(params: {
  bookingId: string;
  actorUserId: string;
  actorRole: Role;
  reason: string;
}): Promise<{ booking: Booking; feePaisa: number }> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: { service: { select: { name: true } }, provider: { select: { userId: true } } },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');

  if (!ACTIVE_STATUSES.includes(booking.status)) {
    throw new AppError(
      'CANCELLATION_NOT_ALLOWED',
      'This booking cannot be cancelled at this stage.',
    );
  }

  const [freeWindowMinutes, feePaisa] = await Promise.all([
    getSetting('booking.freeCancellationMinutes'),
    getSetting('booking.cancellationFeePaisa'),
  ]);

  // Admins never incur the customer fee; neither does a cancellation made
  // comfortably before the slot, or one where no time was agreed yet.
  const isStaff = params.actorRole === 'ADMIN' || params.actorRole === 'SUPER_ADMIN';
  const insideWindow =
    booking.scheduledFor !== null &&
    booking.scheduledFor.getTime() - Date.now() < freeWindowMinutes * 60_000;
  const appliedFee = !isStaff && insideWindow ? feePaisa : 0;

  const result = await transitionBooking({
    bookingId: booking.id,
    to: 'CANCELLED',
    actorRole: params.actorRole,
    actorUserId: params.actorUserId,
    reason: params.reason,
    metadata: { cancellationFeePaisa: appliedFee, insideFreeWindow: insideWindow },
  });

  const audience = new Set<string>([booking.customerId]);
  if (booking.provider?.userId) audience.add(booking.provider.userId);
  audience.delete(params.actorUserId);

  await notifyMany([...audience], {
    event: NOTIFICATION_EVENTS.BOOKING_CANCELLED,
    title: `Booking cancelled — ${booking.reference}`,
    body: `Your ${booking.service.name} booking has been cancelled. Reason: ${params.reason}${
      appliedFee > 0 ? ` Late cancellation fee: ${formatPaisa(appliedFee)}.` : ''
    }`,
    href: `/account/bookings/${booking.id}`,
    data: { bookingId: booking.id },
  });

  return { booking: result.booking, feePaisa: appliedFee };
}

/** Resolve and validate a promo code for this customer. */
async function resolvePromoCode(code: string, customerId: string) {
  const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (
    !promo ||
    !promo.isActive ||
    (promo.startsAt && promo.startsAt > now) ||
    (promo.endsAt && promo.endsAt < now)
  ) {
    throw new AppError('PROMO_INVALID', 'That promo code is not valid.');
  }
  if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) {
    throw new AppError('PROMO_INVALID', 'That promo code has reached its limit.');
  }
  const used = await prisma.booking.count({
    where: { customerId, promoCodeId: promo.id, status: { not: 'CANCELLED' } },
  });
  if (used >= promo.perCustomerLimit) {
    throw new AppError('PROMO_INVALID', 'You have already used this promo code.');
  }
  return promo;
}
