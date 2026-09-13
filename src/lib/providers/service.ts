import { createHash } from 'crypto';
import type { ProviderProfile, ProviderStatus, Role, VerificationKind } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { uniqueSlug } from '../ids';
import { getSetting } from '../settings';
import { notify, notifyAdmins, NOTIFICATION_EVENTS } from '../notifications';
import { revokeAllSessions } from '../auth/service';

/**
 * Provider onboarding and admin approval.
 *
 * Two rules shape this module:
 *  1. A provider is invisible to customers until an admin verifies them. There
 *     is no code path that lets a self-registered provider receive a public
 *     booking while PENDING_VERIFICATION.
 *  2. A verification badge is only ever set from an actual completed check.
 *     `PLATFORM_ONBOARDING` means "we reviewed their onboarding submission" and
 *     nothing more — we do not claim government verification, licensing,
 *     insurance or a background check anywhere.
 */

export interface OnboardProviderInput {
  userId: string;
  businessName: string;
  contactPhone: string;
  headline?: string;
  description?: string;
  yearsExperience: number;
  addressLine?: string;
  sector?: string;
  /** Service ids with the provider's own starting price, in paisa. */
  services: Array<{ serviceId: string; startingPricePaisa: number }>;
  zoneIds: string[];
  availability: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  emergencyAvailable: boolean;
  emergencyFeePaisa?: number;
  serviceRadiusKm?: number;
  /** Masked CNIC reference, e.g. last 4 digits. The full number is not stored. */
  cnicReference?: string;
  bankAccountTitle?: string;
  bankName?: string;
  /** Full IBAN — only a hash and the last 4 digits are persisted. */
  bankIban?: string;
}

/**
 * Create or update the provider's own profile.
 *
 * Idempotent: a provider can revise their submission while
 * PENDING_VERIFICATION. Once VERIFIED, changing services/areas/pricing is still
 * allowed, but status is never modified from here.
 */
export async function upsertProviderProfile(input: OnboardProviderInput): Promise<ProviderProfile> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, isActive: true, deletedAt: null },
    select: {
      id: true,
      role: true,
      fullName: true,
      providerProfile: { select: { id: true, status: true } },
    },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');
  if (user.role !== 'PROVIDER') {
    throw new AppError('FORBIDDEN', 'This is not a provider account.');
  }

  const [maxEmergencyFee, autoApprove, requireCnic] = await Promise.all([
    getSetting('emergency.maxFeePaisa'),
    getSetting('providers.autoApprove'),
    getSetting('providers.requireCnicForVerification'),
  ]);

  if (input.emergencyAvailable && (input.emergencyFeePaisa ?? 0) > maxEmergencyFee) {
    throw new AppError(
      'VALIDATION_ERROR',
      'The emergency fee cannot exceed the platform maximum.',
    );
  }

  // Validate the catalogue references before writing anything.
  const services = await prisma.service.findMany({
    where: { id: { in: input.services.map((s) => s.serviceId) }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (services.length !== input.services.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more of the selected services is unavailable.');
  }
  const zones = await prisma.serviceZone.findMany({
    where: { id: { in: input.zoneIds }, isActive: true },
    select: { id: true },
  });
  if (zones.length !== input.zoneIds.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more of the selected areas is unavailable.');
  }
  if (input.services.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Select at least one service.');
  }
  if (input.zoneIds.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Select at least one service area.');
  }

  const isNew = !user.providerProfile;
  const slug = user.providerProfile
    ? undefined
    : await uniqueSlug(input.businessName, async (candidate) =>
        Boolean(
          await prisma.providerProfile.findUnique({
            where: { slug: candidate },
            select: { id: true },
          }),
        ),
      );

  const bankIbanHash = input.bankIban
    ? createHash('sha256').update(input.bankIban.replace(/\s+/g, '').toUpperCase()).digest('hex')
    : undefined;
  const bankAccountLast4 = input.bankIban
    ? input.bankIban.replace(/\s+/g, '').slice(-4)
    : undefined;

  const profile = await prisma.$transaction(async (tx) => {
    const saved = user.providerProfile
      ? await tx.providerProfile.update({
          where: { id: user.providerProfile.id },
          data: {
            businessName: input.businessName.trim(),
            headline: input.headline?.trim() || null,
            description: input.description?.trim() || null,
            yearsExperience: input.yearsExperience,
            contactPhone: input.contactPhone.trim(),
            addressLine: input.addressLine?.trim() || null,
            sector: input.sector?.trim() || null,
            emergencyAvailable: input.emergencyAvailable,
            emergencyFeePaisa: input.emergencyAvailable ? (input.emergencyFeePaisa ?? 0) : 0,
            serviceRadiusKm: input.serviceRadiusKm ?? 15,
            bankAccountTitle: input.bankAccountTitle?.trim() ?? undefined,
            bankName: input.bankName?.trim() ?? undefined,
            ...(bankIbanHash ? { bankIbanHash, bankAccountLast4 } : {}),
          },
        })
      : await tx.providerProfile.create({
          data: {
            userId: input.userId,
            businessName: input.businessName.trim(),
            slug: slug!,
            headline: input.headline?.trim() || null,
            description: input.description?.trim() || null,
            yearsExperience: input.yearsExperience,
            contactPhone: input.contactPhone.trim(),
            addressLine: input.addressLine?.trim() || null,
            sector: input.sector?.trim() || null,
            emergencyAvailable: input.emergencyAvailable,
            emergencyFeePaisa: input.emergencyAvailable ? (input.emergencyFeePaisa ?? 0) : 0,
            serviceRadiusKm: input.serviceRadiusKm ?? 15,
            bankAccountTitle: input.bankAccountTitle?.trim() || null,
            bankName: input.bankName?.trim() || null,
            bankIbanHash: bankIbanHash ?? null,
            bankAccountLast4: bankAccountLast4 ?? null,
            status: 'PENDING_VERIFICATION',
          },
        });

    // Replace the sets wholesale — simpler and safer than diffing, and these
    // are small collections.
    await tx.providerService.deleteMany({ where: { providerId: saved.id } });
    await tx.providerService.createMany({
      data: input.services.map((service) => ({
        providerId: saved.id,
        serviceId: service.serviceId,
        startingPricePaisa: service.startingPricePaisa,
      })),
    });

    await tx.serviceArea.deleteMany({ where: { providerId: saved.id } });
    await tx.serviceArea.createMany({
      data: input.zoneIds.map((zoneId) => ({ providerId: saved.id, zoneId })),
    });

    await tx.providerAvailability.deleteMany({ where: { providerId: saved.id } });
    if (input.availability.length > 0) {
      await tx.providerAvailability.createMany({
        data: input.availability.map((window) => ({
          providerId: saved.id,
          dayOfWeek: window.dayOfWeek,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
        })),
        skipDuplicates: true,
      });
    }

    // Seed the verification checklist. Phone/email start from the user record;
    // identity waits for a document; onboarding review is the admin's own step.
    const kinds: Array<{ kind: VerificationKind; reference?: string }> = [
      { kind: 'PHONE' },
      { kind: 'EMAIL' },
      { kind: 'IDENTITY_CNIC', reference: input.cnicReference },
      { kind: 'PLATFORM_ONBOARDING' },
      ...(input.bankIban ? [{ kind: 'BANK_ACCOUNT' as VerificationKind }] : []),
    ];
    for (const entry of kinds) {
      await tx.providerVerification.upsert({
        where: { providerId_kind: { providerId: saved.id, kind: entry.kind } },
        create: {
          providerId: saved.id,
          kind: entry.kind,
          status: entry.kind === 'IDENTITY_CNIC' && entry.reference ? 'SUBMITTED' : 'NOT_SUBMITTED',
          reference: entry.reference ?? null,
        },
        update: entry.reference ? { reference: entry.reference, status: 'SUBMITTED' } : {},
      });
    }

    return saved;
  });

  if (isNew) {
    await notifyAdmins({
      event: NOTIFICATION_EVENTS.PROVIDER_APPROVED,
      title: 'New provider awaiting verification',
      body: `${profile.businessName} has completed onboarding and needs review.`,
      href: `/admin/providers/${profile.id}`,
      data: { providerId: profile.id },
    });
  }

  // Auto-approve exists for controlled pilots and is off by default; when a
  // CNIC document is required it cannot bypass that.
  if (isNew && autoApprove && !requireCnic) {
    await approveProvider({
      providerId: profile.id,
      actorUserId: input.userId,
      actorRole: 'ADMIN',
      note: 'Auto-approved by platform setting providers.autoApprove',
    });
  }

  return profile;
}

/** Admin approves a provider, making them visible and bookable. */
export async function approveProvider(params: {
  providerId: string;
  actorUserId: string;
  actorRole: Role;
  note?: string;
}): Promise<ProviderProfile> {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: params.providerId },
    include: {
      user: { select: { id: true, fullName: true } },
      verifications: true,
      _count: { select: { services: true, serviceAreas: true } },
    },
  });
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found.');
  if (provider.status === 'VERIFIED') {
    throw new AppError('CONFLICT', 'This provider is already verified.');
  }

  // A verified provider must actually be bookable, or the badge is misleading.
  if (provider._count.services === 0 || provider._count.serviceAreas === 0) {
    throw new AppError(
      'CONFLICT',
      'A provider needs services and service areas set before they can be approved.',
    );
  }

  const requireCnic = await getSetting('providers.requireCnicForVerification');
  if (requireCnic) {
    const identity = provider.verifications.find((v) => v.kind === 'IDENTITY_CNIC');
    if (!identity || identity.status === 'NOT_SUBMITTED') {
      throw new AppError(
        'CONFLICT',
        'No identity document was submitted. The requirement can be changed in platform settings.',
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.providerProfile.update({
      where: { id: provider.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        rejectedReason: null,
        suspendedReason: null,
      },
    });
    // The onboarding review is exactly what an admin just did — so this badge,
    // and only this one, is set here.
    await tx.providerVerification.update({
      where: { providerId_kind: { providerId: provider.id, kind: 'PLATFORM_ONBOARDING' } },
      data: {
        status: 'APPROVED',
        reviewedByUserId: params.actorUserId,
        reviewedAt: new Date(),
        notes: params.note ?? null,
      },
    });
    return saved;
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROVIDER_APPROVED,
    entity: 'ProviderProfile',
    entityId: provider.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { businessName: provider.businessName, note: params.note ?? null },
  });

  await notify({
    event: NOTIFICATION_EVENTS.PROVIDER_APPROVED,
    userId: provider.userId,
    title: 'Your profile is verified',
    body: 'Congratulations. You can now receive jobs on Islamabad Fix.',
    href: '/provider',
    data: { providerId: provider.id },
  });

  return updated;
}

export async function rejectProvider(params: {
  providerId: string;
  actorUserId: string;
  actorRole: Role;
  reason: string;
}): Promise<ProviderProfile> {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: params.providerId },
    select: { id: true, userId: true, businessName: true },
  });
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found.');

  const updated = await prisma.providerProfile.update({
    where: { id: provider.id },
    data: { status: 'REJECTED', rejectedReason: params.reason.trim(), verifiedAt: null },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROVIDER_REJECTED,
    entity: 'ProviderProfile',
    entityId: provider.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { reason: params.reason },
  });

  await notify({
    event: NOTIFICATION_EVENTS.PROVIDER_REJECTED,
    userId: provider.userId,
    title: 'Your profile was not verified',
    body: `Reason: ${params.reason} You can correct your details and submit again.`,
    href: '/provider/onboarding',
    data: { providerId: provider.id },
  });

  return updated;
}

/**
 * Suspend a provider. Their sessions are revoked and every offer still awaiting
 * a response is withdrawn, so a suspended provider cannot pick up new work.
 * Jobs already accepted are left alone for ops to reassign deliberately.
 */
export async function suspendProvider(params: {
  providerId: string;
  actorUserId: string;
  actorRole: Role;
  reason: string;
}): Promise<ProviderProfile> {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: params.providerId },
    select: { id: true, userId: true, businessName: true },
  });
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found.');

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.providerProfile.update({
      where: { id: provider.id },
      data: { status: 'SUSPENDED', suspendedReason: params.reason.trim() },
    });
    await tx.bookingOffer.updateMany({
      where: { providerId: provider.id, respondedAt: null },
      data: { respondedAt: new Date(), accepted: false, declineReason: 'provider_suspended' },
    });
    return saved;
  });

  await revokeAllSessions(provider.userId);

  await recordAudit({
    action: AUDIT_ACTIONS.PROVIDER_SUSPENDED,
    entity: 'ProviderProfile',
    entityId: provider.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { reason: params.reason },
  });

  await notify({
    event: NOTIFICATION_EVENTS.PROVIDER_SUSPENDED,
    userId: provider.userId,
    title: 'Your account has been suspended',
    body: `Reason: ${params.reason} Please contact support.`,
    data: { providerId: provider.id },
  });

  return updated;
}

export async function reinstateProvider(params: {
  providerId: string;
  actorUserId: string;
  actorRole: Role;
  note?: string;
}): Promise<ProviderProfile> {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: params.providerId },
    select: { id: true, userId: true, status: true, verifiedAt: true },
  });
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found.');
  if (provider.status !== 'SUSPENDED') {
    throw new AppError('CONFLICT', 'Only a suspended provider can be reinstated.');
  }

  const updated = await prisma.providerProfile.update({
    where: { id: provider.id },
    // A previously verified provider returns to VERIFIED; one suspended before
    // verification goes back into the queue rather than skipping review.
    data: {
      status: provider.verifiedAt ? 'VERIFIED' : 'PENDING_VERIFICATION',
      suspendedReason: null,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROVIDER_REINSTATED,
    entity: 'ProviderProfile',
    entityId: provider.id,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { note: params.note ?? null, newStatus: updated.status },
  });

  await notify({
    event: NOTIFICATION_EVENTS.PROVIDER_APPROVED,
    userId: provider.userId,
    title: 'Your account is active again',
    body: 'You can receive jobs again.',
    href: '/provider',
    data: { providerId: provider.id },
  });

  return updated;
}

/**
 * Set one verification badge. Deliberately granular so an admin can approve the
 * identity check without implying anything else was checked.
 */
export async function setVerification(params: {
  providerId: string;
  kind: VerificationKind;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NOT_SUBMITTED';
  actorUserId: string;
  actorRole: Role;
  notes?: string;
}): Promise<void> {
  await prisma.providerVerification.upsert({
    where: { providerId_kind: { providerId: params.providerId, kind: params.kind } },
    create: {
      providerId: params.providerId,
      kind: params.kind,
      status: params.status,
      notes: params.notes ?? null,
      reviewedByUserId: params.actorUserId,
      reviewedAt: new Date(),
    },
    update: {
      status: params.status,
      notes: params.notes ?? null,
      reviewedByUserId: params.actorUserId,
      reviewedAt: new Date(),
    },
  });

  // Keep the user record in step for the two checks it also tracks.
  const provider = await prisma.providerProfile.findUnique({
    where: { id: params.providerId },
    select: { userId: true },
  });
  if (provider && params.status === 'APPROVED') {
    if (params.kind === 'PHONE') {
      await prisma.user.update({
        where: { id: provider.userId },
        data: { phoneVerifiedAt: new Date() },
      });
    }
    if (params.kind === 'EMAIL') {
      await prisma.user.update({
        where: { id: provider.userId },
        data: { emailVerifiedAt: new Date() },
      });
    }
  }

  await recordAudit({
    action: AUDIT_ACTIONS.PROVIDER_VERIFICATION_UPDATED,
    entity: 'ProviderVerification',
    entityId: params.providerId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { kind: params.kind, status: params.status, notes: params.notes ?? null },
  });
}

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

export const VERIFICATION_LABELS: Record<
  VerificationKind,
  { en: string; help: string }
> = {
  IDENTITY_CNIC: {
    en: 'Identity verified',
    help: 'The provider submitted a CNIC document and the team checked it.',
  },
  PHONE: {
    en: 'Phone verified',
    help: 'The phone number has been confirmed.',
  },
  EMAIL: {
    en: 'Email verified',
    help: 'The email address has been confirmed.',
  },
  PLATFORM_ONBOARDING: {
    en: 'Platform verified',
    help: 'The Islamabad Fix team reviewed this provider\u2019s onboarding submission.',
  },
  BANK_ACCOUNT: {
    en: 'Payout account verified',
    help: 'The bank account for payouts has been confirmed.',
  },
};
