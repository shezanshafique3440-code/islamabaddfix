import type { MembershipStatus, PaymentMethod, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db';
import { AppError } from '../errors';
import { AUDIT_ACTIONS, recordAudit } from '../audit';
import { membershipReference } from '../ids';
import { formatPaisa, percentToBasisPoints, rupeesToPaisa } from '../money';
import { notify, NOTIFICATION_EVENTS } from '../notifications';
import { getSetting } from '../settings';

/**
 * Memberships.
 *
 * Three rules hold this together:
 *
 *  1. **Benefits are snapshotted at purchase.** Editing a plan changes what the
 *     next buyer gets, never what an existing member already paid for. Every
 *     benefit field is copied onto the Membership row.
 *
 *  2. **Benefits are applied server-side, from the membership row.** Nothing a
 *     client sends decides a discount, exactly as with commission. The wizard
 *     shows an estimate; the booking total is computed here.
 *
 *  3. **A membership is only active once its payment is confirmed.** Online
 *     payment is not enabled yet, so purchase records an intent and the
 *     operations team confirms receipt — the same honest path cash bookings
 *     already take. Nothing pretends to have charged a card.
 */

/** Benefits in force for a customer right now. Null when they have no cover. */
export interface ActiveBenefits {
  membershipId: string;
  planName: string;
  discountBp: number;
  maxDiscountPaisa: number | null;
  guaranteeBonusDays: number;
  priorityFanoutBonus: number;
  emergencyFeeWaiverPaisa: number;
  endsAt: Date | null;
  /** True while the membership has lapsed but is inside the grace period. */
  inGracePeriod: boolean;
}

const MEMBERSHIP_SELECT = {
  id: true,
  reference: true,
  status: true,
  pricePaisa: true,
  periodDays: true,
  discountBp: true,
  maxDiscountPaisa: true,
  guaranteeBonusDays: true,
  priorityFanoutBonus: true,
  emergencyFeeWaiverPaisa: true,
  startsAt: true,
  endsAt: true,
  cancelledAt: true,
  createdAt: true,
  plan: { select: { id: true, code: true, name: true, tagline: true } },
} satisfies Prisma.MembershipSelect;

// ---------------------------------------------------------------- plans ----

export async function listPublicPlans() {
  const enabled = await getSetting('memberships.enabled');
  if (!enabled) return [];
  return prisma.membershipPlan.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { pricePaisa: 'asc' }],
  });
}

export async function listAllPlans() {
  return prisma.membershipPlan.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { pricePaisa: 'asc' }],
    include: { _count: { select: { memberships: true } } },
  });
}

export interface PlanInput {
  code: string;
  name: string;
  tagline?: string | null;
  description: string;
  pricePaisa: number;
  periodDays: number;
  discountBp: number;
  maxDiscountPaisa?: number | null;
  guaranteeBonusDays: number;
  priorityFanoutBonus: number;
  emergencyFeeWaiverPaisa: number;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Ceilings on what a plan may promise.
 *
 * A mistyped discount here would quietly eat the platform's revenue on every
 * booking a member makes, so the registry holds a hard limit and the plan
 * editor cannot exceed it.
 */
async function assertPlanWithinLimits(input: PlanInput): Promise<void> {
  const [maxDiscountBp, maxFanout] = await Promise.all([
    getSetting('memberships.maxDiscountBp'),
    getSetting('memberships.maxFanoutBonus'),
  ]);
  if (input.discountBp > maxDiscountBp) {
    throw new AppError(
      'VALIDATION_ERROR',
      `A plan may not discount more than ${maxDiscountBp / 100}%.`,
      { fields: [{ path: 'discountBp', message: `Maximum ${maxDiscountBp / 100}%.` }] },
    );
  }
  if (input.priorityFanoutBonus > maxFanout) {
    throw new AppError(
      'VALIDATION_ERROR',
      `A plan may not notify more than ${maxFanout} extra technicians.`,
      { fields: [{ path: 'priorityFanoutBonus', message: `Maximum ${maxFanout}.` }] },
    );
  }
}

/**
 * Rupees and percentages at the edge; paisa and basis points inside.
 *
 * Lives here rather than in the route so both the create and the update route
 * convert identically — a plan that means one thing on POST and another on
 * PATCH would be a very quiet way to give away money.
 */
export function toPlanInput(input: {
  code: string;
  name: string;
  tagline?: string | null;
  description: string;
  priceRupees: number;
  periodDays: number;
  discountPercent: number;
  maxDiscountRupees?: number | null;
  guaranteeBonusDays: number;
  priorityFanoutBonus: number;
  emergencyFeeWaiverRupees: number;
  isActive: boolean;
  sortOrder: number;
}): PlanInput {
  return {
    code: input.code,
    name: input.name,
    tagline: input.tagline ?? null,
    description: input.description,
    pricePaisa: rupeesToPaisa(input.priceRupees),
    periodDays: input.periodDays,
    discountBp: percentToBasisPoints(input.discountPercent),
    maxDiscountPaisa:
      input.maxDiscountRupees != null ? rupeesToPaisa(input.maxDiscountRupees) : null,
    guaranteeBonusDays: input.guaranteeBonusDays,
    priorityFanoutBonus: input.priorityFanoutBonus,
    emergencyFeeWaiverPaisa: rupeesToPaisa(input.emergencyFeeWaiverRupees),
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

export async function upsertPlan(params: { id?: string; input: PlanInput; actorUserId: string }) {
  await assertPlanWithinLimits(params.input);
  const data = { ...params.input, tagline: params.input.tagline ?? null };

  const plan = params.id
    ? await prisma.membershipPlan.update({ where: { id: params.id }, data })
    : await prisma.membershipPlan.create({ data });

  await recordAudit({
    action: AUDIT_ACTIONS.MEMBERSHIP_PLAN_CHANGED,
    entity: 'MembershipPlan',
    entityId: plan.id,
    actorUserId: params.actorUserId,
    metadata: { code: plan.code, created: !params.id },
  });
  return plan;
}

/**
 * Soft-delete a plan.
 *
 * Existing memberships keep working: their benefits live on the membership row,
 * not the plan, so retiring a tier never strips cover from someone who paid for
 * it. The row stays for the foreign key and for reporting.
 */
export async function retirePlan(params: { id: string; actorUserId: string }) {
  const plan = await prisma.membershipPlan.update({
    where: { id: params.id },
    data: { isActive: false, deletedAt: new Date() },
  });
  await recordAudit({
    action: AUDIT_ACTIONS.MEMBERSHIP_PLAN_CHANGED,
    entity: 'MembershipPlan',
    entityId: plan.id,
    actorUserId: params.actorUserId,
    metadata: { code: plan.code, retired: true },
  });
  return plan;
}

// ----------------------------------------------------------- membership ----

/**
 * The membership a customer can actually use right now.
 *
 * Covers the grace period: a membership that ended yesterday still pays out
 * while a renewal is being confirmed, because the alternative is a member who
 * paid on time losing their discount to our payment processing.
 */
export async function activeBenefitsFor(
  userId: string,
  /** Pass the surrounding transaction when reading inside one. */
  client: Tx | typeof prisma = prisma,
): Promise<ActiveBenefits | null> {
  const [enabled, graceDays] = await Promise.all([
    getSetting('memberships.enabled'),
    getSetting('memberships.gracePeriodDays'),
  ]);
  if (!enabled) return null;

  const now = new Date();
  const graceFloor = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);

  const membership = await client.membership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gte: graceFloor },
    },
    orderBy: { endsAt: 'desc' },
    select: MEMBERSHIP_SELECT,
  });
  if (!membership) return null;

  return {
    membershipId: membership.id,
    planName: membership.plan.name,
    discountBp: membership.discountBp,
    maxDiscountPaisa: membership.maxDiscountPaisa,
    guaranteeBonusDays: membership.guaranteeBonusDays,
    priorityFanoutBonus: membership.priorityFanoutBonus,
    emergencyFeeWaiverPaisa: membership.emergencyFeeWaiverPaisa,
    endsAt: membership.endsAt,
    inGracePeriod: membership.endsAt !== null && membership.endsAt < now,
  };
}

export async function membershipsFor(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      ...MEMBERSHIP_SELECT,
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          method: true,
          status: true,
          amountPaisa: true,
          paidAt: true,
          createdAt: true,
        },
      },
    },
  });
}

/**
 * Buy a plan.
 *
 * Records the intent and a pending payment. Activation happens when the payment
 * is confirmed — see `confirmMembershipPayment`. Buying while already covered is
 * refused rather than silently stacking two memberships, because which one pays
 * out would then be a coin toss.
 */
export async function purchaseMembership(params: {
  userId: string;
  planId: string;
  method: PaymentMethod;
}) {
  const enabled = await getSetting('memberships.enabled');
  if (!enabled) {
    throw new AppError('MEMBERSHIP_NOT_AVAILABLE', 'Memberships are not available right now.');
  }

  const plan = await prisma.membershipPlan.findFirst({
    where: { id: params.planId, isActive: true, deletedAt: null },
  });
  if (!plan) throw new AppError('NOT_FOUND', 'Plan not found.');

  const existing = await prisma.membership.findFirst({
    where: {
      userId: params.userId,
      status: { in: ['ACTIVE', 'PENDING_PAYMENT'] satisfies MembershipStatus[] },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new AppError(
      'MEMBERSHIP_ALREADY_ACTIVE',
      existing.status === 'ACTIVE'
        ? 'You already have an active membership.'
        : 'You already have a membership waiting for payment confirmation.',
    );
  }

  const membership = await prisma.$transaction(async (tx) => {
    const created = await tx.membership.create({
      data: {
        reference: membershipReference(),
        userId: params.userId,
        planId: plan.id,
        status: 'PENDING_PAYMENT',
        // Snapshot — a later edit to the plan must not change this purchase.
        pricePaisa: plan.pricePaisa,
        periodDays: plan.periodDays,
        discountBp: plan.discountBp,
        maxDiscountPaisa: plan.maxDiscountPaisa,
        guaranteeBonusDays: plan.guaranteeBonusDays,
        priorityFanoutBonus: plan.priorityFanoutBonus,
        emergencyFeeWaiverPaisa: plan.emergencyFeeWaiverPaisa,
      },
      select: MEMBERSHIP_SELECT,
    });
    await tx.membershipPayment.create({
      data: {
        membershipId: created.id,
        method: params.method,
        status: 'PENDING',
        amountPaisa: plan.pricePaisa,
      },
    });
    return created;
  });

  await recordAudit({
    action: AUDIT_ACTIONS.MEMBERSHIP_PURCHASED,
    entity: 'Membership',
    entityId: membership.id,
    actorUserId: params.userId,
    metadata: { plan: plan.code, pricePaisa: plan.pricePaisa, method: params.method },
  });

  return membership;
}

/**
 * Operations confirms the money arrived; the membership starts now.
 *
 * Deliberately admin-only. Until an online gateway is configured there is no
 * automatic path from "customer clicked subscribe" to "customer has paid", and
 * inventing one would be the fake-functionality trap this product avoids.
 */
export async function confirmMembershipPayment(params: {
  membershipId: string;
  actorUserId: string;
  externalRef?: string | null;
}) {
  const membership = await prisma.membership.findUnique({
    where: { id: params.membershipId },
    select: {
      ...MEMBERSHIP_SELECT,
      userId: true,
      payments: { select: { id: true, status: true } },
    },
  });
  if (!membership) throw new AppError('NOT_FOUND', 'Membership not found.');
  if (membership.status === 'ACTIVE') {
    throw new AppError('MEMBERSHIP_ALREADY_ACTIVE', 'This membership is already active.');
  }
  if (membership.status !== 'PENDING_PAYMENT') {
    throw new AppError('MEMBERSHIP_NOT_ACTIVE', 'This membership is cancelled or expired.');
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + membership.periodDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.$transaction(async (tx) => {
    const pending = membership.payments.find((payment) => payment.status === 'PENDING');
    if (pending) {
      await tx.membershipPayment.update({
        where: { id: pending.id },
        data: {
          status: 'PAID',
          paidAt: now,
          externalRef: params.externalRef ?? null,
          recordedByUserId: params.actorUserId,
        },
      });
    }
    return tx.membership.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE', startsAt: now, endsAt },
      select: MEMBERSHIP_SELECT,
    });
  });

  await recordAudit({
    action: AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
    entity: 'Membership',
    entityId: membership.id,
    actorUserId: params.actorUserId,
    metadata: { reference: membership.reference, endsAt: endsAt.toISOString() },
  });

  await notify({
    event: NOTIFICATION_EVENTS.MEMBERSHIP_ACTIVATED,
    userId: membership.userId,
    title: `${membership.plan.name} is active`,
    body: `Your membership runs until ${endsAt.toLocaleDateString('en-PK')}. Benefits apply automatically to every booking — nothing to enter.`,
    href: '/account/membership',
    data: { membershipId: membership.id },
  });

  return updated;
}

export async function cancelMembership(params: {
  membershipId: string;
  actorUserId: string;
  actorIsAdmin?: boolean;
  reason: string;
}) {
  const membership = await prisma.membership.findUnique({
    where: { id: params.membershipId },
    select: { id: true, userId: true, status: true, reference: true, endsAt: true },
  });
  if (!membership) throw new AppError('NOT_FOUND', 'Membership not found.');
  if (!params.actorIsAdmin && membership.userId !== params.actorUserId) {
    throw new AppError('FORBIDDEN', 'This membership is not yours.');
  }
  if (membership.status === 'CANCELLED' || membership.status === 'EXPIRED') {
    throw new AppError('MEMBERSHIP_NOT_ACTIVE', 'This membership is already closed.');
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: params.reason },
    select: MEMBERSHIP_SELECT,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.MEMBERSHIP_CANCELLED,
    entity: 'Membership',
    entityId: membership.id,
    actorUserId: params.actorUserId,
    metadata: { reference: membership.reference, reason: params.reason },
  });

  return updated;
}

/**
 * Close out memberships whose window has passed, grace period included.
 *
 * Idempotent, so it is safe to call from a scheduled job or from a request.
 * Benefits already stop at the grace boundary in `activeBenefitsFor` — this only
 * makes the record say so.
 */
export async function expireLapsedMemberships(): Promise<number> {
  const graceDays = await getSetting('memberships.gracePeriodDays');
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const lapsed = await prisma.membership.findMany({
    where: { status: 'ACTIVE', endsAt: { lt: cutoff } },
    select: { id: true, userId: true, reference: true },
  });
  if (lapsed.length === 0) return 0;

  await prisma.membership.updateMany({
    where: { id: { in: lapsed.map((row) => row.id) } },
    data: { status: 'EXPIRED' },
  });

  for (const row of lapsed) {
    await recordAudit({
      action: AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
      entity: 'Membership',
      entityId: row.id,
      metadata: { reference: row.reference },
    });
  }
  return lapsed.length;
}

// ------------------------------------------------------------- benefits ----

export interface DiscountResult {
  discountPaisa: number;
  /** What the member is told, e.g. "Care Plus · 10% member discount". */
  label: string | null;
}

/**
 * The member discount on a booking subtotal.
 *
 * Rounds down, and never exceeds the plan's cap or the subtotal itself. The
 * emergency fee is excluded from the base: it is the technician's money for
 * turning out at night, not the platform's to discount. A separate waiver
 * covers it when the plan grants one.
 */
export function memberDiscountPaisa(
  benefits: ActiveBenefits | null,
  subtotalPaisa: number,
): DiscountResult {
  if (!benefits || benefits.discountBp <= 0 || subtotalPaisa <= 0) {
    return { discountPaisa: 0, label: null };
  }
  const raw = Math.floor((subtotalPaisa * benefits.discountBp) / 10_000);
  const capped = benefits.maxDiscountPaisa == null ? raw : Math.min(raw, benefits.maxDiscountPaisa);
  const discountPaisa = Math.max(0, Math.min(capped, subtotalPaisa));
  if (discountPaisa === 0) return { discountPaisa: 0, label: null };
  return {
    discountPaisa,
    label: `${benefits.planName} · ${benefits.discountBp / 100}% member discount`,
  };
}

/** How much of an emergency fee the plan absorbs on this booking. */
export function emergencyFeeWaiverPaisa(
  benefits: ActiveBenefits | null,
  emergencyFeePaisa: number,
): number {
  if (!benefits || emergencyFeePaisa <= 0) return 0;
  return Math.min(benefits.emergencyFeeWaiverPaisa, emergencyFeePaisa);
}

/** A short, honest summary for the booking wizard and the plans page. */
export function describeBenefits(benefits: {
  discountBp: number;
  maxDiscountPaisa: number | null;
  guaranteeBonusDays: number;
  priorityFanoutBonus: number;
  emergencyFeeWaiverPaisa: number;
}): string[] {
  const lines: string[] = [];
  if (benefits.discountBp > 0) {
    const cap =
      benefits.maxDiscountPaisa == null
        ? ''
        : ` (up to ${formatPaisa(benefits.maxDiscountPaisa)} per booking)`;
    lines.push(`${benefits.discountBp / 100}% off every completed booking${cap}`);
  }
  if (benefits.emergencyFeeWaiverPaisa > 0) {
    lines.push(
      `Emergency call-out fee covered up to ${formatPaisa(benefits.emergencyFeeWaiverPaisa)}`,
    );
  }
  if (benefits.guaranteeBonusDays > 0) {
    lines.push(`${benefits.guaranteeBonusDays} extra days of re-visit guarantee`);
  }
  if (benefits.priorityFanoutBonus > 0) {
    lines.push(
      `Your request reaches ${benefits.priorityFanoutBonus} more technicians in the first wave`,
    );
  }
  return lines;
}
