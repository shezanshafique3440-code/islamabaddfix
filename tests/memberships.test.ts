import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { createBooking } from '@/lib/bookings/service';
import { approveQuote, completeBooking, submitQuote } from '@/lib/bookings/quotes';
import { bookingTotals } from '@/lib/bookings/totals';
import { initiatePayment } from '@/lib/payments';
import {
  activeBenefitsFor,
  cancelMembership,
  confirmMembershipPayment,
  emergencyFeeWaiverPaisa,
  expireLapsedMemberships,
  memberDiscountPaisa,
  purchaseMembership,
  upsertPlan,
} from '@/lib/memberships';
import {
  createAddress,
  createMembership,
  createProvider,
  createService,
  createUser,
  createZone,
  db,
  setSettingValue,
  tomorrowAt,
} from './helpers';
import { truncateAll } from './setup';

const DAY = 24 * 60 * 60 * 1000;

async function scenario(options: { emergency?: boolean } = {}) {
  const customer = await createUser({ role: 'CUSTOMER' });
  const service = await createService({ isEmergencyEnabled: options.emergency ?? false });
  const zone = await createZone();
  const { provider, user: providerUser } = await createProvider({
    serviceIds: [service.id],
    zoneIds: [zone.id],
    emergencyAvailable: options.emergency ?? false,
  });
  const address = await createAddress(customer.id, zone.id);
  return { customer, service, zone, provider, providerUser, address };
}

/** Book, quote, approve and complete — the whole path that freezes a total. */
async function completeJob(params: {
  customerId: string;
  serviceId: string;
  addressId: string;
  providerId: string;
  providerUserId: string;
  itemPaisa: number;
  isEmergency?: boolean;
}) {
  const { booking } = await createBooking({
    customerId: params.customerId,
    serviceId: params.serviceId,
    addressId: params.addressId,
    providerId: params.providerId,
    problemDescription: 'The AC runs but no cold air comes out at all.',
    scheduledFor: params.isEmergency ? null : tomorrowAt(),
    isEmergency: params.isEmergency ?? false,
  });

  await db.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });

  const quote = await submitQuote({
    bookingId: booking.id,
    providerId: params.providerId,
    actorUserId: params.providerUserId,
    items: [{ kind: 'LABOUR', label: 'Labour', quantity: 1, unitPricePaisa: params.itemPaisa }],
  });
  await approveQuote({ quoteId: quote.id, customerUserId: params.customerId });
  await db.booking.update({ where: { id: booking.id }, data: { status: 'IN_PROGRESS' } });
  await completeBooking({
    bookingId: booking.id,
    providerId: params.providerId,
    actorUserId: params.providerUserId,
  });

  return db.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

describe('membership benefit arithmetic', () => {
  const benefits = {
    membershipId: 'm1',
    planName: 'Care Plus',
    discountBp: 1000,
    maxDiscountPaisa: null,
    guaranteeBonusDays: 30,
    priorityFanoutBonus: 2,
    emergencyFeeWaiverPaisa: 50_000,
    endsAt: null,
    inGracePeriod: false,
  };

  it('takes the plan percentage off the subtotal', () => {
    expect(memberDiscountPaisa(benefits, 300_000).discountPaisa).toBe(30_000);
  });

  it('never exceeds the plan cap', () => {
    const capped = { ...benefits, maxDiscountPaisa: 20_000 };
    expect(memberDiscountPaisa(capped, 300_000).discountPaisa).toBe(20_000);
  });

  it('rounds down, so a member is never credited a paisa they are not owed', () => {
    // 999 * 10% = 99.9 paisa.
    expect(memberDiscountPaisa(benefits, 999).discountPaisa).toBe(99);
  });

  it('is zero without a membership', () => {
    expect(memberDiscountPaisa(null, 300_000).discountPaisa).toBe(0);
  });

  it('never discounts more than the subtotal itself', () => {
    const everything = { ...benefits, discountBp: 10_000 };
    expect(memberDiscountPaisa(everything, 5_000).discountPaisa).toBe(5_000);
  });

  it('waives an emergency fee only up to what was actually charged', () => {
    expect(emergencyFeeWaiverPaisa(benefits, 80_000)).toBe(50_000);
    expect(emergencyFeeWaiverPaisa(benefits, 20_000)).toBe(20_000);
    expect(emergencyFeeWaiverPaisa(null, 80_000)).toBe(0);
  });
});

describe('membership lifecycle', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('memberships.enabled', true);
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('does not activate a membership until the payment is confirmed', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const admin = await createUser({ role: 'ADMIN' });
    const plan = await db.membershipPlan.create({
      data: {
        code: 'care',
        name: 'Care',
        description: 'A plan for testing.',
        pricePaisa: 500_000,
        discountBp: 1000,
      },
    });

    const membership = await purchaseMembership({
      userId: customer.id,
      planId: plan.id,
      method: 'CASH',
    });
    expect(membership.status).toBe('PENDING_PAYMENT');
    // Crucially: no benefits before the money is confirmed.
    expect(await activeBenefitsFor(customer.id)).toBeNull();

    await confirmMembershipPayment({ membershipId: membership.id, actorUserId: admin.id });

    const benefits = await activeBenefitsFor(customer.id);
    expect(benefits?.discountBp).toBe(1000);
    const payment = await db.membershipPayment.findFirstOrThrow({
      where: { membershipId: membership.id },
    });
    expect(payment.status).toBe('PAID');
    expect(payment.paidAt).not.toBeNull();
  });

  it('refuses to sell a second membership on top of a live one', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const plan = await db.membershipPlan.create({
      data: { code: 'care', name: 'Care', description: 'A plan.', pricePaisa: 500_000 },
    });
    await purchaseMembership({ userId: customer.id, planId: plan.id, method: 'CASH' });

    await expect(
      purchaseMembership({ userId: customer.id, planId: plan.id, method: 'CASH' }),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_ALREADY_ACTIVE' });
  });

  it('sells nothing while memberships are switched off', async () => {
    await setSettingValue('memberships.enabled', false);
    const customer = await createUser({ role: 'CUSTOMER' });
    const plan = await db.membershipPlan.create({
      data: { code: 'care', name: 'Care', description: 'A plan.', pricePaisa: 500_000 },
    });
    await expect(
      purchaseMembership({ userId: customer.id, planId: plan.id, method: 'CASH' }),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_NOT_AVAILABLE' });
  });

  it('keeps benefits through the grace period, then drops them', async () => {
    await setSettingValue('memberships.gracePeriodDays', 3);
    const customer = await createUser({ role: 'CUSTOMER' });

    // Ended yesterday: inside the grace period, still covered.
    const { membership } = await createMembership({
      userId: customer.id,
      endsAt: new Date(Date.now() - 1 * DAY),
    });
    const inGrace = await activeBenefitsFor(customer.id);
    expect(inGrace?.inGracePeriod).toBe(true);
    expect(inGrace?.discountBp).toBe(1000);

    // Ended ten days ago: past grace, no cover.
    await db.membership.update({
      where: { id: membership.id },
      data: { endsAt: new Date(Date.now() - 10 * DAY) },
    });
    expect(await activeBenefitsFor(customer.id)).toBeNull();
  });

  it('expires lapsed memberships and leaves fresh ones alone', async () => {
    await setSettingValue('memberships.gracePeriodDays', 3);
    const lapsedUser = await createUser({ role: 'CUSTOMER' });
    const currentUser = await createUser({ role: 'CUSTOMER' });
    const { membership: lapsed } = await createMembership({
      userId: lapsedUser.id,
      endsAt: new Date(Date.now() - 30 * DAY),
    });
    const { membership: current } = await createMembership({ userId: currentUser.id });

    expect(await expireLapsedMemberships()).toBe(1);
    expect((await db.membership.findUniqueOrThrow({ where: { id: lapsed.id } })).status).toBe(
      'EXPIRED',
    );
    expect((await db.membership.findUniqueOrThrow({ where: { id: current.id } })).status).toBe(
      'ACTIVE',
    );
    // Idempotent — a second sweep changes nothing.
    expect(await expireLapsedMemberships()).toBe(0);
  });

  it('will not let one customer cancel another customer’s membership', async () => {
    const owner = await createUser({ role: 'CUSTOMER' });
    const stranger = await createUser({ role: 'CUSTOMER' });
    const { membership } = await createMembership({ userId: owner.id });

    await expect(
      cancelMembership({
        membershipId: membership.id,
        actorUserId: stranger.id,
        reason: 'Not mine to cancel',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses a plan that discounts more than the platform ceiling', async () => {
    await setSettingValue('memberships.maxDiscountBp', 2000);
    const admin = await createUser({ role: 'ADMIN' });

    await expect(
      upsertPlan({
        actorUserId: admin.id,
        input: {
          code: 'too-generous',
          name: 'Too generous',
          description: 'Half off everything, forever.',
          pricePaisa: 100,
          periodDays: 365,
          discountBp: 5000,
          guaranteeBonusDays: 0,
          priorityFanoutBonus: 0,
          emergencyFeeWaiverPaisa: 0,
          isActive: true,
          sortOrder: 0,
        },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('keeps an existing member on the terms they bought after the plan changes', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const admin = await createUser({ role: 'ADMIN' });
    const { plan } = await createMembership({ userId: customer.id, discountBp: 1500 });

    await upsertPlan({
      id: plan.id,
      actorUserId: admin.id,
      input: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        pricePaisa: plan.pricePaisa,
        periodDays: plan.periodDays,
        discountBp: 0,
        guaranteeBonusDays: 0,
        priorityFanoutBonus: 0,
        emergencyFeeWaiverPaisa: 0,
        isActive: true,
        sortOrder: 0,
      },
    });

    // The plan now grants nothing; the member still has what they paid for.
    expect((await activeBenefitsFor(customer.id))?.discountBp).toBe(1500);
  });
});

describe('membership benefits on a booking', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('memberships.enabled', true);
    await setSettingValue('platform.commissionRateBp', 1000);
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('takes the member discount off the total and off commission', async () => {
    const base = await scenario();
    await createMembership({ userId: base.customer.id, discountBp: 1000 });

    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
    });

    expect(booking.finalTotalPaisa).toBe(300_000);
    expect(booking.membershipDiscountPaisa).toBe(30_000);
    // Commission is charged on what the customer actually pays, not the sticker.
    expect(booking.commissionPaisa).toBe(27_000);
    expect(booking.providerEarningsPaisa).toBe(243_000);
  });

  it('charges a non-member the full amount', async () => {
    const base = await scenario();
    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
    });

    expect(booking.membershipDiscountPaisa).toBe(0);
    expect(booking.membershipId).toBeNull();
    expect(booking.commissionPaisa).toBe(30_000);
  });

  it('writes a benefit ledger row that explains the discount', async () => {
    const base = await scenario();
    const { membership } = await createMembership({
      userId: base.customer.id,
      discountBp: 1000,
      guaranteeBonusDays: 30,
    });

    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
    });

    const entries = await db.membershipBenefit.findMany({
      where: { bookingId: booking.id },
      orderBy: { kind: 'asc' },
    });
    expect(entries.map((entry) => entry.kind)).toEqual(['DISCOUNT', 'GUARANTEE_EXTENSION']);
    expect(entries[0]!.amountPaisa).toBe(30_000);
    expect(entries[0]!.membershipId).toBe(membership.id);
    expect(entries[1]!.days).toBe(30);
  });

  it('extends an existing guarantee by the plan bonus', async () => {
    await setSettingValue('guarantee.enabled', true);
    await setSettingValue('guarantee.days', 30);
    const base = await scenario();
    await createMembership({ userId: base.customer.id, discountBp: 0, guaranteeBonusDays: 60 });

    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
    });

    expect(booking.guaranteeEligible).toBe(true);
    expect(booking.guaranteeDays).toBe(90);
  });

  it('does not invent a guarantee on a service that has none', async () => {
    await setSettingValue('guarantee.enabled', true);
    await setSettingValue('guarantee.days', 30);
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService({ guaranteeEligible: false });
    const zone = await createZone();
    const { provider, user: providerUser } = await createProvider({
      serviceIds: [service.id],
      zoneIds: [zone.id],
    });
    const address = await createAddress(customer.id, zone.id);
    await createMembership({ userId: customer.id, guaranteeBonusDays: 60 });

    const booking = await completeJob({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      providerId: provider.id,
      providerUserId: providerUser.id,
      itemPaisa: 300_000,
    });

    expect(booking.guaranteeEligible).toBe(false);
    expect(booking.guaranteeDays).toBe(0);
  });

  it('waives the emergency fee without discounting it twice', async () => {
    await setSettingValue('emergency.enabled', true);
    const base = await scenario({ emergency: true });
    await createMembership({
      userId: base.customer.id,
      discountBp: 1000,
      emergencyFeeWaiverPaisa: 50_000,
    });

    // 300,000 of work; approval adds the provider's 80,000 emergency fee on top.
    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
      isEmergency: true,
    });

    expect(booking.emergencyFeePaisa).toBe(80_000);
    expect(booking.finalTotalPaisa).toBe(380_000);
    // The percentage applies to the work only — 10% of 300,000 — and the fee is
    // handled by the waiver, so the member is never credited for it twice.
    expect(booking.membershipDiscountPaisa).toBe(30_000 + 50_000);
    expect(booking.commissionPaisa).toBe(30_000);
  });

  it('sends a member’s request to a wider first wave of technicians', async () => {
    await setSettingValue('booking.offerFanout', 1);
    const customer = await createUser({ role: 'CUSTOMER' });
    const service = await createService();
    const zone = await createZone();
    for (let i = 0; i < 4; i += 1) {
      await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
    }
    const address = await createAddress(customer.id, zone.id);
    await createMembership({ userId: customer.id, priorityFanoutBonus: 2 });

    const result = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Two switches in the lounge have stopped working.',
      scheduledFor: tomorrowAt(),
    });

    // Platform fan-out of 1, plus the plan's bonus of 2.
    expect(result.offeredProviderIds).toHaveLength(3);
  });

  it('applies nothing once memberships are switched off platform-wide', async () => {
    const base = await scenario();
    await createMembership({ userId: base.customer.id, discountBp: 1000 });
    await setSettingValue('memberships.enabled', false);

    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
    });

    expect(booking.membershipDiscountPaisa).toBe(0);
    expect(booking.commissionPaisa).toBe(30_000);
  });
});

describe('what the customer actually owes', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('memberships.enabled', true);
    await setSettingValue('platform.commissionRateBp', 1000);
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('bills the discounted amount, not the agreed total', async () => {
    const base = await scenario();
    await createMembership({ userId: base.customer.id, discountBp: 1000 });

    const booking = await completeJob({
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
      providerId: base.provider.id,
      providerUserId: base.providerUser.id,
      itemPaisa: 300_000,
    });

    // The agreed price stands at 300,000; the member owes 270,000. Charging the
    // agreed total here would hand the discount to nobody.
    const { payment } = await initiatePayment({
      bookingId: booking.id,
      method: 'CASH',
      actorUserId: base.customer.id,
    });
    expect(payment.amountPaisa).toBe(270_000);
  });

  it('never lets discounts push the amount owed below zero', () => {
    expect(
      bookingTotals({
        finalTotalPaisa: 10_000,
        approvedTotalPaisa: null,
        discountPaisa: 8_000,
        membershipDiscountPaisa: 9_000,
      }).payablePaisa,
    ).toBe(0);
  });
});
