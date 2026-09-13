import type { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { isStaff } from '../auth/rbac';
import type { AuthContext } from '../auth/session';
import { fileUrl } from '../storage';
import { maskPhone } from '../utils';
import {
  ACTIVE_STATUSES,
  actorForRole,
  availableTransitions,
  humanStatus,
  trackerIndex,
} from './state-machine';

/**
 * Booking read projections.
 *
 * Each viewer gets a different shape, and the differences are privacy
 * decisions rather than convenience:
 *  - The customer sees the provider's business identity but not their personal
 *    address or bank details.
 *  - The provider sees the customer's name, full address and phone only once
 *    they have accepted the job — before that the address is coarsened to the
 *    zone, so browsing the offer queue is not a way to harvest addresses.
 *  - Staff see everything, because they arbitrate disputes.
 */

const DETAIL_INCLUDE = {
  service: {
    select: {
      id: true,
      name: true,
      slug: true,
      estimatedMinutes: true,
      requiresInspection: true,
      category: { select: { name: true, slug: true, iconKey: true } },
    },
  },
  customer: { select: { id: true, fullName: true, phone: true, email: true } },
  provider: {
    select: {
      id: true,
      slug: true,
      businessName: true,
      headline: true,
      contactPhone: true,
      profilePhotoId: true,
      ratingAverage: true,
      ratingCount: true,
      completedJobs: true,
      yearsExperience: true,
      userId: true,
      verifications: { where: { status: 'APPROVED' as const }, select: { kind: true } },
    },
  },
  address: {
    select: {
      id: true,
      label: true,
      addressLine: true,
      houseOrBuilding: true,
      landmark: true,
      city: true,
      latitude: true,
      longitude: true,
      contactPhone: true,
      zone: { select: { id: true, name: true, slug: true } },
    },
  },
  files: {
    where: { deletedAt: null },
    select: {
      id: true,
      mimeType: true,
      originalName: true,
      isCompletionProof: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  quotes: {
    include: { items: { orderBy: { createdAt: 'asc' as const } } },
    orderBy: { createdAt: 'desc' as const },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
  review: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  disputes: { orderBy: { createdAt: 'desc' as const } },
  guaranteeClaims: { orderBy: { createdAt: 'desc' as const } },
  promoCode: { select: { code: true, kind: true, value: true } },
} satisfies Prisma.BookingInclude;

type BookingDetailRow = Prisma.BookingGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const LIST_INCLUDE = {
  service: {
    select: {
      name: true,
      slug: true,
      category: { select: { name: true, slug: true, iconKey: true } },
    },
  },
  provider: { select: { id: true, businessName: true, slug: true, profilePhotoId: true } },
  address: { select: { zone: { select: { name: true } }, city: true } },
  review: { select: { id: true, rating: true } },
  _count: { select: { disputes: true, guaranteeClaims: true } },
} satisfies Prisma.BookingInclude;

export type BookingListRow = Prisma.BookingGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Status sets behind the customer dashboard's tabs. */
const SCOPE_STATUSES: Record<string, BookingStatus[] | undefined> = {
  active: [...ACTIVE_STATUSES],
  upcoming: ['ACCEPTED', 'QUOTE_APPROVED', 'SCHEDULED'],
  completed: ['COMPLETED', 'REFUNDED'],
  cancelled: ['CANCELLED'],
  disputed: ['DISPUTED'],
  all: undefined,
};

export interface ListBookingsQuery {
  page: number;
  perPage: number;
  scope: 'active' | 'upcoming' | 'completed' | 'cancelled' | 'disputed' | 'all';
  status?: string[];
  search?: string;
}

/**
 * Bookings visible to this viewer. The `where` clause is scoped by role, so
 * pagination cannot be used to walk other people's jobs.
 */
export async function listBookingsFor(ctx: AuthContext, query: ListBookingsQuery) {
  const scopeStatuses = SCOPE_STATUSES[query.scope];
  const explicitStatuses = query.status?.filter((status): status is BookingStatus =>
    isBookingStatus(status),
  );

  const roleScope: Prisma.BookingWhereInput = isStaff(ctx.role)
    ? {}
    : ctx.role === 'PROVIDER'
      ? // A provider sees jobs assigned to them plus jobs they have been offered.
        {
          OR: [
            { providerId: ctx.providerId ?? '00000000-0000-0000-0000-000000000000' },
            {
              offers: { some: { providerId: ctx.providerId ?? '', respondedAt: null } },
              status: { in: ['PENDING', 'PROVIDER_NOTIFIED'] },
            },
          ],
        }
      : { customerId: ctx.user.id };

  const where: Prisma.BookingWhereInput = {
    deletedAt: null,
    ...roleScope,
    ...(explicitStatuses?.length
      ? { status: { in: explicitStatuses } }
      : scopeStatuses
        ? { status: { in: scopeStatuses } }
        : {}),
    ...(query.search
      ? {
          OR: [
            { reference: { contains: query.search, mode: 'insensitive' } },
            { problemDescription: { contains: query.search, mode: 'insensitive' } },
            { service: { name: { contains: query.search, mode: 'insensitive' } } },
            ...(isStaff(ctx.role)
              ? [
                  {
                    customer: {
                      fullName: { contains: query.search, mode: 'insensitive' as const },
                    },
                  },
                  {
                    provider: {
                      businessName: { contains: query.search, mode: 'insensitive' as const },
                    },
                  },
                ]
              : []),
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  };
}

function isBookingStatus(value: string): value is BookingStatus {
  return [
    'PENDING',
    'PROVIDER_NOTIFIED',
    'ACCEPTED',
    'QUOTE_PENDING',
    'QUOTE_APPROVED',
    'SCHEDULED',
    'ON_THE_WAY',
    'ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'DISPUTED',
    'REFUNDED',
  ].includes(value);
}

export function summarizeBooking(booking: BookingListRow) {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    statusLabel: humanStatus(booking.status),
    trackerStep: trackerIndex(booking.status),
    urgency: booking.urgency,
    isEmergency: booking.isEmergency,
    serviceName: booking.service.name,
    serviceSlug: booking.service.slug,
    category: booking.service.category,
    problemDescription: booking.problemDescription,
    zoneName: booking.address.zone?.name ?? booking.address.city,
    scheduledFor: booking.scheduledFor,
    approvedTotalPaisa: booking.approvedTotalPaisa,
    finalTotalPaisa: booking.finalTotalPaisa,
    provider: booking.provider
      ? {
          id: booking.provider.id,
          businessName: booking.provider.businessName,
          slug: booking.provider.slug,
          photoUrl: booking.provider.profilePhotoId
            ? fileUrl(booking.provider.profilePhotoId)
            : null,
        }
      : null,
    hasReview: booking.review !== null,
    reviewRating: booking.review?.rating ?? null,
    hasDispute: booking._count.disputes > 0,
    hasGuaranteeClaim: booking._count.guaranteeClaims > 0,
    guaranteeExpiresAt: booking.guaranteeExpiresAt,
    isDemo: booking.isDemo,
    createdAt: booking.createdAt,
    completedAt: booking.completedAt,
  };
}

export type BookingSummary = ReturnType<typeof summarizeBooking>;

/** Booking detail, or NOT_FOUND when the viewer is not a party to it. */
export async function getBookingDetailFor(bookingId: string, ctx: AuthContext) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    include: DETAIL_INCLUDE,
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');

  const isCustomer = booking.customerId === ctx.user.id;
  const isAssignedProvider = ctx.providerId !== undefined && booking.providerId === ctx.providerId;
  const staff = isStaff(ctx.role);

  // A provider who was offered the job but has not accepted may still view it,
  // with the address and contact details withheld.
  const wasOffered =
    !isAssignedProvider && ctx.providerId
      ? (await prisma.bookingOffer.count({
          where: { bookingId: booking.id, providerId: ctx.providerId },
        })) > 0
      : false;

  if (!isCustomer && !isAssignedProvider && !staff && !wasOffered) {
    throw new AppError('NOT_FOUND', 'Booking not found.');
  }

  const viewer = staff
    ? 'ADMIN'
    : isCustomer
      ? 'CUSTOMER'
      : isAssignedProvider
        ? 'PROVIDER'
        : 'PROVIDER_OFFERED';

  return projectBooking(booking, viewer, actorForRole(ctx.role));
}

export type BookingViewer = 'CUSTOMER' | 'PROVIDER' | 'PROVIDER_OFFERED' | 'ADMIN';

export function projectBooking(
  booking: BookingDetailRow,
  viewer: BookingViewer,
  actor: ReturnType<typeof actorForRole>,
) {
  // Contact details are released only once the job is genuinely mutual: the
  // customer always sees the provider's, the provider sees the customer's after
  // accepting. Staff see both.
  const providerHasAccepted = viewer === 'PROVIDER' || viewer === 'ADMIN';
  const showCustomerContact = viewer === 'CUSTOMER' || providerHasAccepted;
  const showFullAddress = viewer === 'CUSTOMER' || providerHasAccepted;

  const pendingQuote = booking.quotes.find((quote) => quote.status === 'SUBMITTED') ?? null;
  const approvedQuote = booking.quotes.find((quote) => quote.status === 'APPROVED') ?? null;

  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    statusLabel: humanStatus(booking.status),
    trackerStep: trackerIndex(booking.status),
    urgency: booking.urgency,
    isEmergency: booking.isEmergency,
    problemDescription: booking.problemDescription,
    customerNotes: booking.customerNotes,
    providerNotes: booking.providerNotes,
    scheduledFor: booking.scheduledFor,
    scheduledWindowMinutes: booking.scheduledWindowMinutes,

    service: booking.service,

    customer:
      viewer === 'CUSTOMER'
        ? { id: booking.customer.id, fullName: booking.customer.fullName, isYou: true }
        : {
            id: booking.customer.id,
            fullName: booking.customer.fullName,
            // Masked until the provider has committed to the job.
            phone: showCustomerContact
              ? booking.customer.phone
              : maskPhone(booking.customer.phone ?? ''),
            email: viewer === 'ADMIN' ? booking.customer.email : undefined,
            isYou: false,
          },

    provider: booking.provider
      ? {
          id: booking.provider.id,
          slug: booking.provider.slug,
          businessName: booking.provider.businessName,
          headline: booking.provider.headline,
          photoUrl: booking.provider.profilePhotoId
            ? fileUrl(booking.provider.profilePhotoId)
            : null,
          ratingAverage: booking.provider.ratingAverage,
          ratingCount: booking.provider.ratingCount,
          completedJobs: booking.provider.completedJobs,
          yearsExperience: booking.provider.yearsExperience,
          badges: booking.provider.verifications.map((v) => v.kind),
          // The technician's number reaches the customer once assigned; a
          // provider viewing their own job does not need it.
          contactPhone:
            viewer === 'CUSTOMER' || viewer === 'ADMIN' ? booking.provider.contactPhone : undefined,
        }
      : null,

    address: showFullAddress
      ? {
          id: booking.address.id,
          label: booking.address.label,
          addressLine: booking.address.addressLine,
          houseOrBuilding: booking.address.houseOrBuilding,
          landmark: booking.address.landmark,
          city: booking.address.city,
          zone: booking.address.zone,
          latitude: booking.address.latitude,
          longitude: booking.address.longitude,
          contactPhone: booking.address.contactPhone,
        }
      : {
          // Offered-but-not-accepted: area only, no street, no coordinates.
          id: booking.address.id,
          city: booking.address.city,
          zone: booking.address.zone,
          addressLine: null,
          houseOrBuilding: null,
          landmark: null,
          latitude: null,
          longitude: null,
          contactPhone: null,
          label: null,
        },

    media: booking.files.map((file) => ({
      id: file.id,
      url: fileUrl(file.id),
      mimeType: file.mimeType,
      originalName: file.originalName,
      isCompletionProof: file.isCompletionProof,
      isVideo: file.mimeType.startsWith('video/'),
      createdAt: file.createdAt,
    })),

    pricing: {
      approvedTotalPaisa: booking.approvedTotalPaisa,
      finalTotalPaisa: booking.finalTotalPaisa,
      emergencyFeePaisa: booking.emergencyFeePaisa,
      discountPaisa: booking.discountPaisa,
      promoCode: booking.promoCode?.code ?? null,
      // Commission is platform-internal; providers see their own earnings.
      commissionPaisa: viewer === 'ADMIN' ? booking.commissionPaisa : undefined,
      commissionRateBp: viewer === 'ADMIN' ? booking.commissionRateBp : undefined,
      providerEarningsPaisa:
        viewer === 'PROVIDER' || viewer === 'ADMIN' ? booking.providerEarningsPaisa : undefined,
    },

    quotes: booking.quotes.map((quote) => ({
      id: quote.id,
      status: quote.status,
      isAdditional: quote.isAdditional,
      subtotalPaisa: quote.subtotalPaisa,
      notes: quote.notes,
      validUntil: quote.validUntil,
      submittedAt: quote.submittedAt,
      respondedAt: quote.respondedAt,
      rejectionReason: quote.rejectionReason,
      items: quote.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        quantity: item.quantity,
        unitPricePaisa: item.unitPricePaisa,
        totalPaisa: item.unitPricePaisa * item.quantity,
      })),
    })),
    pendingQuoteId: pendingQuote?.id ?? null,
    approvedQuoteId: approvedQuote?.id ?? null,

    payments: booking.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amountPaisa: payment.amountPaisa,
      refundedPaisa: payment.refundedPaisa,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    })),

    review: booking.review
      ? {
          id: booking.review.id,
          rating: booking.review.rating,
          comment: booking.review.comment,
          serviceQuality: booking.review.serviceQuality,
          professionalism: booking.review.professionalism,
          punctuality: booking.review.punctuality,
          valueForMoney: booking.review.valueForMoney,
          createdAt: booking.review.createdAt,
          // Only the provider and staff see how the customer was rated.
          providerRatingOfCustomer:
            viewer === 'PROVIDER' || viewer === 'ADMIN'
              ? booking.review.providerRatingOfCustomer
              : undefined,
        }
      : null,

    guarantee: {
      eligible: booking.guaranteeEligible,
      days: booking.guaranteeDays,
      expiresAt: booking.guaranteeExpiresAt,
      isActive:
        booking.guaranteeEligible &&
        booking.guaranteeExpiresAt !== null &&
        booking.guaranteeExpiresAt > new Date(),
      claims: booking.guaranteeClaims.map((claim) => ({
        id: claim.id,
        reference: claim.reference,
        status: claim.status,
        createdAt: claim.createdAt,
        revisitScheduledFor: claim.revisitScheduledFor,
      })),
    },

    disputes: booking.disputes.map((dispute) => ({
      id: dispute.id,
      reference: dispute.reference,
      reason: dispute.reason,
      status: dispute.status,
      description: dispute.description,
      resolutionNotes: dispute.resolutionNotes,
      refundPaisa: dispute.refundPaisa,
      createdAt: dispute.createdAt,
    })),

    timeline: booking.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      label: humanStatus(entry.toStatus),
      reason: entry.reason,
      at: entry.createdAt,
    })),

    /** Transitions this viewer may perform right now — drives the buttons. */
    availableActions: availableTransitions(booking.status, actor).map((rule) => ({
      to: rule.to,
      label: rule.label,
    })),

    intakeSummary: booking.intakeSummary,
    isDemo: booking.isDemo,
    createdAt: booking.createdAt,
    completedAt: booking.completedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
  };
}

export type BookingDetail = ReturnType<typeof projectBooking>;

/** Provider's day view: today's jobs in schedule order. */
export async function getProviderSchedule(providerId: string, day: Date) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  return prisma.booking.findMany({
    where: {
      providerId,
      deletedAt: null,
      status: {
        in: ['ACCEPTED', 'QUOTE_APPROVED', 'SCHEDULED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'],
      },
      OR: [
        { scheduledFor: { gte: dayStart, lt: dayEnd } },
        // Emergencies without a slot still belong on today's list.
        { scheduledFor: null, isEmergency: true },
      ],
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    include: LIST_INCLUDE,
  });
}

/** Jobs offered to a provider and still awaiting their response. */
export async function getProviderOffers(providerId: string) {
  const offers = await prisma.bookingOffer.findMany({
    where: {
      providerId,
      respondedAt: null,
      booking: { status: { in: ['PENDING', 'PROVIDER_NOTIFIED'] }, deletedAt: null },
    },
    orderBy: { notifiedAt: 'desc' },
    include: { booking: { include: LIST_INCLUDE } },
  });

  const now = Date.now();
  return (
    offers
      // An expired offer is not actionable; hide it rather than let a provider
      // accept something the customer has moved on from.
      .filter((offer) => !offer.expiresAt || offer.expiresAt.getTime() > now)
      .map((offer) => ({
        offerId: offer.id,
        notifiedAt: offer.notifiedAt,
        expiresAt: offer.expiresAt,
        booking: summarizeBooking(offer.booking),
      }))
  );
}
