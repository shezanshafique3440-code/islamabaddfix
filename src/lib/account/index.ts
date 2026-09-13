import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { verifyPassword } from '../auth/password';
import { revokeAllSessions } from '../auth/service';
import { ACTIVE_STATUSES } from '../bookings/state-machine';

/**
 * Account closure and data export.
 *
 * The privacy policy tells people they may see their data and close their
 * account. This module is what makes that true — a promise in a policy page
 * that the product cannot keep is worse than no promise at all.
 *
 * Closure is **anonymisation, not erasure**, and the policy says so in its next
 * sentence: booking and payment records are kept for accounting and for the
 * other party to the transaction, who has their own claim on that history. What
 * goes is everything that identifies the person — name, email, phone, addresses
 * and their uploaded media.
 */

/** Work in flight that somebody else is depending on. */
async function blockers(userId: string): Promise<string[]> {
  const reasons: string[] = [];

  const liveBookings = await prisma.booking.count({
    where: {
      customerId: userId,
      status: { in: [...ACTIVE_STATUSES] },
      deletedAt: null,
    },
  });
  if (liveBookings > 0) {
    reasons.push(
      `${liveBookings} booking(s) are still under way. Complete or cancel them first.`,
    );
  }

  const unpaid = await prisma.booking.count({
    where: {
      customerId: userId,
      status: 'COMPLETED',
      deletedAt: null,
      payments: { none: { status: { in: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] } } },
    },
  });
  if (unpaid > 0) {
    reasons.push(`${unpaid} completed booking(s) have not been paid for yet.`);
  }

  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (provider) {
    const liveJobs = await prisma.booking.count({
      where: {
        providerId: provider.id,
        status: { in: [...ACTIVE_STATUSES] },
        deletedAt: null,
      },
    });
    if (liveJobs > 0) {
      reasons.push(`${liveJobs} job(s) are still under way with you. Finish them first.`);
    }

    const owed = await prisma.payoutItem.aggregate({
      where: { payout: { providerId: provider.id, status: { in: ['PENDING', 'PROCESSING'] } } },
      _sum: { netPaisa: true },
    });
    if ((owed._sum.netPaisa ?? 0) > 0) {
      reasons.push('A payout is still being processed. Please wait until it completes.');
    }
  }

  return reasons;
}

/** What stands between this account and closure, for the UI to show up front. */
export async function closureBlockers(userId: string): Promise<string[]> {
  return blockers(userId);
}

/**
 * Close an account.
 *
 * Requires the current password: this is irreversible from the user's side, and
 * a logged-in session someone left open on a shared phone must not be enough.
 */
export async function closeAccount(params: {
  userId: string;
  password: string;
  reason?: string;
}): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, deletedAt: null },
    select: { id: true, passwordHash: true, email: true, role: true },
  });
  if (!user) throw new AppError('NOT_FOUND', 'Account not found.');

  if (!(await verifyPassword(params.password, user.passwordHash))) {
    throw new AppError('INVALID_CREDENTIALS', 'Wrong password.');
  }

  // An administrator closing their own account could lock everybody out of the
  // platform. That goes through another admin, deliberately.
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    throw new AppError(
      'FORBIDDEN',
      'A staff account cannot be closed by its own holder. Ask another administrator.',
    );
  }

  const outstanding = await blockers(user.id);
  if (outstanding.length > 0) {
    throw new AppError('CONFLICT', outstanding.join(' '), {
      context: { blockers: outstanding },
    });
  }

  const now = new Date();
  // Unique, obviously-dead placeholders: the columns are unique, so they cannot
  // simply be blanked, and a real-looking address would be worse than a fake one.
  const tombstone = `deleted-${randomUUID()}@deleted.invalid`;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        deletedAt: now,
        isActive: false,
        email: tombstone,
        phone: null,
        fullName: 'Deleted user',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
    });

    // Addresses are pure personal data with no counterparty claim on them.
    await tx.address.updateMany({
      where: { userId: user.id, deletedAt: null },
      data: { deletedAt: now, isDefault: false },
    });

    // Uploaded media: hidden from every read path. The objects themselves are
    // swept separately, so a dispute opened the day before closure does not
    // lose its evidence mid-investigation.
    await tx.uploadedFile.updateMany({
      where: { ownerId: user.id, deletedAt: null },
      data: { deletedAt: now },
    });

    // Reviews stay — the provider's rating is built on them and other customers
    // rely on it — but they were already shown under a first name only, which
    // is now "Deleted".
    await tx.verificationToken.deleteMany({ where: { userId: user.id } });

    const provider = await tx.providerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (provider) {
      await tx.providerProfile.update({
        where: { id: provider.id },
        data: {
          deletedAt: now,
          status: 'SUSPENDED',
          suspendedReason: 'Account closed by the provider',
          contactPhone: '',
          addressLine: null,
          bankIbanHash: null,
          bankAccountLast4: null,
          bankAccountTitle: null,
        },
      });
      await tx.providerLocation.deleteMany({ where: { providerId: provider.id } });
    }
  });

  await revokeAllSessions(user.id);

  await recordAudit({
    action: AUDIT_ACTIONS.ACCOUNT_DELETED,
    entity: 'User',
    entityId: user.id,
    actorUserId: user.id,
    actorRole: user.role,
    metadata: { reason: params.reason ?? null, closedAt: now.toISOString() },
  });
}

/**
 * Everything the platform holds about one person, as a plain object.
 *
 * Deliberately built from explicit selects rather than a wildcard dump: an
 * export that silently grows a column is how a password hash ends up in a
 * customer's downloads folder.
 */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      role: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const [addresses, bookings, reviews, notifications, tickets, disputes, claims, files] =
    await Promise.all([
      prisma.address.findMany({
        where: { userId },
        select: {
          label: true,
          addressLine: true,
          houseOrBuilding: true,
          landmark: true,
          city: true,
          latitude: true,
          longitude: true,
          contactPhone: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      prisma.booking.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          reference: true,
          status: true,
          urgency: true,
          isEmergency: true,
          problemDescription: true,
          customerNotes: true,
          scheduledFor: true,
          completedAt: true,
          approvedTotalPaisa: true,
          finalTotalPaisa: true,
          createdAt: true,
          service: { select: { name: true } },
          provider: { select: { businessName: true } },
          quotes: {
            select: {
              status: true,
              isAdditional: true,
              subtotalPaisa: true,
              submittedAt: true,
              items: { select: { kind: true, label: true, quantity: true, unitPricePaisa: true } },
            },
          },
          payments: {
            select: {
              method: true,
              status: true,
              amountPaisa: true,
              refundedPaisa: true,
              paidAt: true,
            },
          },
        },
      }),
      prisma.review.findMany({
        where: { authorId: userId },
        select: { rating: true, comment: true, createdAt: true },
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { channel: true, event: true, title: true, body: true, createdAt: true },
      }),
      prisma.supportTicket.findMany({
        where: { requesterId: userId },
        select: {
          reference: true,
          subject: true,
          description: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.dispute.findMany({
        where: { raisedByUserId: userId },
        select: { reference: true, reason: true, description: true, status: true, createdAt: true },
      }),
      prisma.guaranteeClaim.findMany({
        where: { raisedByUserId: userId },
        select: { reference: true, description: true, status: true, createdAt: true },
      }),
      prisma.uploadedFile.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      }),
    ]);

  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    select: {
      businessName: true,
      headline: true,
      description: true,
      yearsExperience: true,
      status: true,
      ratingAverage: true,
      ratingCount: true,
      completedJobs: true,
      // The IBAN itself was never stored; only these two.
      bankAccountTitle: true,
      bankAccountLast4: true,
      createdAt: true,
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.DATA_EXPORTED,
    entity: 'User',
    entityId: userId,
    actorUserId: userId,
  });

  return {
    exportedAt: new Date().toISOString(),
    note: 'This is the information Islamabad Fix holds about you. Your password is never stored \u2014 only a hash of it, which is not included here. File names are listed; the files themselves are not.',
    account: user,
    notificationPreferences: await prisma.notificationPreference.findUnique({
      where: { userId },
      select: { email: true, sms: true, whatsapp: true, push: true, marketing: true },
    }),
    addresses,
    bookings,
    reviews,
    disputes,
    guaranteeClaims: claims,
    supportTickets: tickets,
    uploadedFiles: files,
    notifications,
    providerProfile: provider,
  };
}
