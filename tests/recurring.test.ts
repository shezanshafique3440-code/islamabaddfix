import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSchedule,
  describeSchedule,
  firstOccurrenceOnOrAfter,
  generateDueBookings,
  nextOccurrenceAfter,
  setScheduleStatus,
} from '@/lib/bookings/recurring';
import {
  createAddress,
  createProvider,
  createService,
  createUser,
  createZone,
  db,
  setSettingValue,
} from './helpers';
import { truncateAll } from './setup';

const DAY = 24 * 60 * 60 * 1000;

async function scenario() {
  const customer = await createUser({ role: 'CUSTOMER' });
  const service = await createService();
  const zone = await createZone();
  const { provider } = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
  const address = await createAddress(customer.id, zone.id);
  return { customer, service, zone, provider, address };
}

const baseInput = (over: Partial<Parameters<typeof createSchedule>[0]> = {}) => ({
  frequency: 'WEEKLY' as const,
  intervalCount: 1,
  timeOfDayMinutes: 600,
  dayOfWeek: 2,
  problemDescription: 'Weekly deep clean of the office, three rooms and a kitchen.',
  ...over,
});

describe('recurrence arithmetic', () => {
  it('finds the next matching weekday, not today when today has passed', () => {
    // Wednesday 12:00. Asking for Tuesday 10:00 means next Tuesday.
    const from = new Date('2026-04-15T12:00:00');
    const next = firstOccurrenceOnOrAfter(from, {
      frequency: 'WEEKLY',
      dayOfWeek: 2,
      dayOfMonth: null,
      timeOfDayMinutes: 600,
    });
    expect(next.getDay()).toBe(2);
    expect(next.getHours()).toBe(10);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it('takes today when the time is still ahead', () => {
    // Tuesday 08:00, wanting Tuesday 10:00 — today.
    const from = new Date('2026-04-14T08:00:00');
    const next = firstOccurrenceOnOrAfter(from, {
      frequency: 'WEEKLY',
      dayOfWeek: 2,
      dayOfMonth: null,
      timeOfDayMinutes: 600,
    });
    expect(next.getDate()).toBe(14);
    expect(next.getHours()).toBe(10);
  });

  it('rolls a monthly schedule into the next month once the day has passed', () => {
    const from = new Date('2026-04-20T09:00:00');
    const next = firstOccurrenceOnOrAfter(from, {
      frequency: 'MONTHLY',
      dayOfWeek: null,
      dayOfMonth: 5,
      timeOfDayMinutes: 540,
    });
    expect(next.getMonth()).toBe(4); // May
    expect(next.getDate()).toBe(5);
  });

  it('advances by whole periods, and by the interval count', () => {
    const start = new Date('2026-04-14T10:00:00');
    expect(nextOccurrenceAfter(start, { frequency: 'WEEKLY', intervalCount: 1 }).getDate()).toBe(
      21,
    );
    expect(nextOccurrenceAfter(start, { frequency: 'WEEKLY', intervalCount: 2 }).getDate()).toBe(
      28,
    );
    expect(nextOccurrenceAfter(start, { frequency: 'MONTHLY', intervalCount: 1 }).getMonth()).toBe(
      4,
    );
    expect(
      nextOccurrenceAfter(start, { frequency: 'QUARTERLY', intervalCount: 1 }).getMonth(),
    ).toBe(6);
  });

  it('describes itself in words a customer can check', () => {
    expect(
      describeSchedule({
        frequency: 'FORTNIGHTLY',
        intervalCount: 1,
        dayOfWeek: 2,
        dayOfMonth: null,
        timeOfDayMinutes: 600,
      }),
    ).toBe('Every two weeks on Tuesday at 10:00');
  });
});

describe('repeat visits', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('recurring.enabled', true);
    await setSettingValue('recurring.leadDays', 3);
    await setSettingValue('payments.enabledMethods', ['CASH']);
  });

  it('refuses an address that belongs to somebody else', async () => {
    const base = await scenario();
    const stranger = await createUser({ role: 'CUSTOMER' });

    await expect(
      createSchedule({
        ...baseInput(),
        customerId: stranger.id,
        serviceId: base.service.id,
        addressId: base.address.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates a booking when an occurrence comes inside the lead window', async () => {
    const base = await scenario();
    const schedule = await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });

    // Pull the occurrence into the window.
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() + 1 * DAY) },
    });

    const report = await generateDueBookings();
    expect(report.created).toBe(1);

    const bookings = await db.booking.findMany({ where: { recurringScheduleId: schedule.id } });
    expect(bookings).toHaveLength(1);
    // A generated booking is an ordinary booking: no price, no approval.
    expect(bookings[0]!.approvedTotalPaisa).toBeNull();
    expect(bookings[0]!.status).not.toBe('COMPLETED');
  });

  it('does not create a booking for an occurrence beyond the lead window', async () => {
    const base = await scenario();
    const schedule = await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() + 20 * DAY) },
    });

    expect((await generateDueBookings()).created).toBe(0);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const base = await scenario();
    const schedule = await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() + 1 * DAY) },
    });

    await generateDueBookings();
    await generateDueBookings();

    expect(await db.booking.count({ where: { recurringScheduleId: schedule.id } })).toBe(1);
  });

  it('stops at the occurrence count the customer agreed to', async () => {
    const base = await scenario();
    const schedule = await createSchedule({
      ...baseInput({ maxOccurrences: 1 }),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() + 1 * DAY) },
    });

    await generateDueBookings();
    // Second occurrence is now due, but the limit is spent.
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() + 1 * DAY) },
    });
    const second = await generateDueBookings();

    expect(second.created).toBe(0);
    expect(second.ended).toBe(1);
    expect(
      (await db.recurringSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status,
    ).toBe('ENDED');
  });

  it('generates nothing while paused, and does not backfill on resume', async () => {
    const base = await scenario();
    const schedule = await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });
    await setScheduleStatus({
      scheduleId: schedule.id,
      actorUserId: base.customer.id,
      status: 'PAUSED',
    });
    // Several occurrences go by while it is paused.
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() - 30 * DAY) },
    });
    expect((await generateDueBookings()).created).toBe(0);

    await setScheduleStatus({
      scheduleId: schedule.id,
      actorUserId: base.customer.id,
      status: 'ACTIVE',
    });

    // Resuming must not fire the month of missed visits at once.
    const resumed = await db.recurringSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(resumed.nextOccurrenceAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('pauses a schedule it cannot book, rather than failing the whole run', async () => {
    const good = await scenario();
    const broken = await scenario();

    const goodSchedule = await createSchedule({
      ...baseInput(),
      customerId: good.customer.id,
      serviceId: good.service.id,
      addressId: good.address.id,
    });
    const brokenSchedule = await createSchedule({
      ...baseInput(),
      customerId: broken.customer.id,
      serviceId: broken.service.id,
      addressId: broken.address.id,
    });

    // The customer deleted the address this schedule points at.
    await db.address.update({
      where: { id: broken.address.id },
      data: { deletedAt: new Date() },
    });

    const due = new Date(Date.now() + 1 * DAY);
    await db.recurringSchedule.updateMany({
      where: { id: { in: [goodSchedule.id, brokenSchedule.id] } },
      data: { nextOccurrenceAt: due },
    });

    const report = await generateDueBookings();

    expect(report.created).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(
      (await db.recurringSchedule.findUniqueOrThrow({ where: { id: brokenSchedule.id } })).status,
    ).toBe('PAUSED');
    // And the customer is told, rather than wondering where their cleaner is.
    const told = await db.notification.findFirst({
      where: { userId: broken.customer.id, event: 'recurring.paused' },
    });
    expect(told).not.toBeNull();
  });

  it('generates nothing at all while repeat visits are switched off', async () => {
    const base = await scenario();
    const schedule = await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });
    await db.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextOccurrenceAt: new Date(Date.now() + 1 * DAY) },
    });
    await setSettingValue('recurring.enabled', false);

    expect((await generateDueBookings()).created).toBe(0);
  });

  it('will not let one customer touch another customer’s schedule', async () => {
    const base = await scenario();
    const stranger = await createUser({ role: 'CUSTOMER' });
    const schedule = await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });

    await expect(
      setScheduleStatus({
        scheduleId: schedule.id,
        actorUserId: stranger.id,
        status: 'ENDED',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('holds a customer to the platform limit on standing arrangements', async () => {
    await setSettingValue('recurring.maxPerCustomer', 1);
    const base = await scenario();
    await createSchedule({
      ...baseInput(),
      customerId: base.customer.id,
      serviceId: base.service.id,
      addressId: base.address.id,
    });

    await expect(
      createSchedule({
        ...baseInput(),
        customerId: base.customer.id,
        serviceId: base.service.id,
        addressId: base.address.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
