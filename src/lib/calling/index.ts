import type { BookingStatus } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { env } from '../env';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { placeBridgedCall } from './bridge';

/**
 * Calling between a customer and their technician.
 *
 * Two modes, and the product is explicit about which one is in force:
 *
 *  **Masked** — a telephony provider bridges the two parties through a platform
 *  number, so neither sees the other's real number. This needs a configured
 *  provider (CALLING_PROVIDER + CALLING_API_KEY + CALLING_FROM_NUMBER).
 *
 *  **Direct** — no provider configured, so the app hands over the number it
 *  already shares after a booking is accepted, and says so. That is not a
 *  degraded masked call pretending to work; it is the existing behaviour,
 *  labelled.
 *
 * The alternative — a call button that silently does nothing without a
 * provider — is the exact failure this codebase refuses everywhere else.
 */

export type CallMode = 'masked' | 'direct';

export interface CallChannel {
  mode: CallMode;
  /**
   * The number to dial, when there is one to dial. Null in masked mode: the
   * platform rings the caller instead, so there is nothing for them to tap.
   */
  dialNumber: string | null;
  /** True when the platform is calling the user rather than the other way round. */
  ringsYouFirst: boolean;
  /** The provider's call reference, for support to trace a complaint. */
  callReference: string | null;
  /** Who the customer is calling, for the UI. */
  counterpartName: string;
  /** True when the counterpart's real number is visible to the caller. */
  numberIsReal: boolean;
  /** How long a masked bridge stays open, in minutes. Null when direct. */
  expiresInMinutes: number | null;
  note: string;
}

/** Contact details are shared only once a technician has taken the job. */
const CONTACTABLE_STATUSES: readonly BookingStatus[] = [
  'ACCEPTED',
  'QUOTE_PENDING',
  'QUOTE_APPROVED',
  'SCHEDULED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
];

export const callingStatus = () => ({
  configured: Boolean(
    env.CALLING_PROVIDER !== 'none' && env.CALLING_API_KEY && env.CALLING_FROM_NUMBER,
  ),
  provider: env.CALLING_PROVIDER,
});

/**
 * Open a call channel between the two parties on a booking.
 *
 * Authorisation is part of the query: the caller must be the customer or the
 * assigned technician on this booking, and the booking must be at a stage where
 * contact details are shared at all.
 */
export async function openCallChannel(params: {
  bookingId: string;
  callerUserId: string;
}): Promise<CallChannel> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: params.bookingId,
      deletedAt: null,
      OR: [{ customerId: params.callerUserId }, { provider: { userId: params.callerUserId } }],
    },
    select: {
      id: true,
      reference: true,
      status: true,
      customerId: true,
      customer: { select: { fullName: true, phone: true } },
      address: { select: { contactPhone: true } },
      provider: {
        select: { userId: true, businessName: true, contactPhone: true },
      },
    },
  });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
  if (!booking.provider) {
    throw new AppError('CONFLICT', 'No technician is assigned to this booking yet.');
  }
  if (!CONTACTABLE_STATUSES.includes(booking.status)) {
    throw new AppError(
      'CONFLICT',
      'Contact details are shared once a technician accepts, and until the job is closed.',
    );
  }

  const callerIsCustomer = booking.customerId === params.callerUserId;
  const counterpartName = callerIsCustomer
    ? booking.provider.businessName
    : booking.customer.fullName;
  const counterpartNumber = callerIsCustomer
    ? booking.provider.contactPhone
    : (booking.address.contactPhone ?? booking.customer.phone);

  if (!counterpartNumber) {
    throw new AppError('NOT_FOUND', 'No phone number is on file for the other party.');
  }

  await recordAudit({
    action: AUDIT_ACTIONS.CALL_CHANNEL_OPENED,
    entity: 'Booking',
    entityId: booking.id,
    actorUserId: params.callerUserId,
    metadata: { reference: booking.reference, masked: callingStatus().configured },
  });

  if (!callingStatus().configured) {
    return {
      mode: 'direct',
      dialNumber: counterpartNumber,
      ringsYouFirst: false,
      callReference: null,
      counterpartName,
      numberIsReal: true,
      expiresInMinutes: null,
      note: 'Number masking is not configured on this deployment, so this is the real number — the same one already shared with you for this booking. It is not hidden from the person you are calling either.',
    };
  }

  // The caller's own number, which the provider rings first.
  const callerNumber = callerIsCustomer
    ? (booking.address.contactPhone ?? booking.customer.phone)
    : booking.provider.contactPhone;

  if (!callerNumber) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A masked call needs your own phone number on file. Add it to your profile first.',
    );
  }

  const bridge = await placeBridgedCall(callerNumber, counterpartNumber);

  return {
    mode: 'masked',
    // Nothing to dial: the phone is about to ring.
    dialNumber: null,
    ringsYouFirst: true,
    callReference: bridge.reference,
    counterpartName,
    numberIsReal: false,
    expiresInMinutes: null,
    note: `Your phone will ring in a moment. Answer it and we will connect you to ${counterpartName}. Neither of you sees the other's number — both calls come from the platform number.`,
  };
}
