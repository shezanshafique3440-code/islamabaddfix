import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/lib/errors';
import {
  listBookingMessages,
  markThreadRead,
  sendBookingMessage,
  unreadMessageCount,
} from '@/lib/bookings/messages';
import { rescheduleBooking, reschedulesRemaining } from '@/lib/bookings/reschedule';
import { createBooking } from '@/lib/bookings/service';
import {
  createAddress,
  createProvider,
  createService,
  createUser,
  createZone,
  db,
  setSettingValue,
  tomorrowAt,
} from './helpers';
import { truncateAll } from './setup';

/**
 * Booking messaging and rescheduling.
 *
 * Both exist because the alternative is worse: without a thread the two
 * parties swap phone numbers and leave the platform, and without a reschedule
 * the only way to move a visit is to cancel it and lose the technician who
 * already said yes.
 *
 * The tests that matter here are the negative ones — who cannot read the
 * thread, and when a time may no longer be moved.
 */

async function scenario() {
  const service = await createService();
  const zone = await createZone();
  const customer = await createUser({ role: 'CUSTOMER' });
  const stranger = await createUser({ role: 'CUSTOMER' });
  const admin = await createUser({ role: 'ADMIN' });
  const assigned = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
  const other = await createProvider({ serviceIds: [service.id], zoneIds: [zone.id] });
  const address = await createAddress(customer.id, zone.id);

  const { booking } = await createBooking({
    customerId: customer.id,
    serviceId: service.id,
    addressId: address.id,
    providerId: assigned.provider.id,
    problemDescription: 'AC chal raha hai lekin thandi hawa nahi aa rahi',
    scheduledFor: tomorrowAt(),
  });
  await db.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });

  return { service, zone, customer, stranger, admin, assigned, other, address, booking };
}

const asCustomer = (user: { id: string }) => ({ userId: user.id, role: 'CUSTOMER' as const });
const asProvider = (user: { id: string }, providerId: string) => ({
  userId: user.id,
  role: 'PROVIDER' as const,
  providerId,
});
const asAdmin = (user: { id: string }) => ({ userId: user.id, role: 'ADMIN' as const });

describe('booking messages', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
  });

  it('opens one thread on first use and reuses it', async () => {
    const { customer, booking } = await scenario();

    const first = await listBookingMessages(booking.id, asCustomer(customer));
    const second = await listBookingMessages(booking.id, asCustomer(customer));

    expect(first.conversationId).toBe(second.conversationId);
    expect(await db.conversation.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it('carries a message from the customer to the technician', async () => {
    const { customer, assigned, booking } = await scenario();

    await sendBookingMessage({
      bookingId: booking.id,
      viewer: asCustomer(customer),
      body: 'Gate par ghanti kharab hai, phone kar lijiye ga.',
    });

    const seenByProvider = await listBookingMessages(
      booking.id,
      asProvider(assigned.user, assigned.provider.id),
    );
    expect(seenByProvider.messages).toHaveLength(1);
    expect(seenByProvider.messages[0]!.body).toContain('ghanti kharab');
    // The sender is "you" only for the person who sent it.
    expect(seenByProvider.messages[0]!.sender?.isYou).toBe(false);
  });

  it('shows only a first name, matching how reviews are shown', async () => {
    const { customer, assigned, booking } = await scenario();
    await db.user.update({ where: { id: customer.id }, data: { fullName: 'Ayesha Khan Sahiba' } });

    await sendBookingMessage({
      bookingId: booking.id,
      viewer: asCustomer(customer),
      body: 'Assalam o alaikum',
    });

    const thread = await listBookingMessages(
      booking.id,
      asProvider(assigned.user, assigned.provider.id),
    );
    expect(thread.messages[0]!.sender?.fullName).toBe('Ayesha');
    expect(JSON.stringify(thread)).not.toContain('Sahiba');
  });

  it('refuses the thread to somebody who is not party to the booking', async () => {
    const { stranger, booking } = await scenario();

    const failure = await listBookingMessages(booking.id, asCustomer(stranger)).catch(
      (error: AppError) => error,
    );
    // 404, not 403 — whether this booking exists is not their business.
    expect((failure as AppError).code).toBe('NOT_FOUND');
  });

  it('keeps a provider who was only offered the job out of the thread', async () => {
    const { other, booking } = await scenario();
    await db.bookingOffer.create({
      data: { bookingId: booking.id, providerId: other.provider.id },
    });

    // The privacy staging exists so that somebody who has not committed to
    // turning up cannot ask for the address. A chat window would be a way round it.
    await expect(
      listBookingMessages(booking.id, asProvider(other.user, other.provider.id)),
    ).rejects.toThrow(/not found/i);
    await expect(
      sendBookingMessage({
        bookingId: booking.id,
        viewer: asProvider(other.user, other.provider.id),
        body: 'Address kya hai?',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('lets staff read and post, because disputes land on them', async () => {
    const { customer, admin, booking } = await scenario();
    await sendBookingMessage({
      bookingId: booking.id,
      viewer: asCustomer(customer),
      body: 'Technician nahi aaya',
    });

    const thread = await listBookingMessages(booking.id, asAdmin(admin));
    expect(thread.messages).toHaveLength(1);

    await sendBookingMessage({
      bookingId: booking.id,
      viewer: asAdmin(admin),
      body: 'Support yahan hai — hum dekh rahe hain.',
    });
    expect(await db.message.count()).toBe(2);
  });

  it('refuses an empty message and an over-long one', async () => {
    const { customer, booking } = await scenario();

    await expect(
      sendBookingMessage({ bookingId: booking.id, viewer: asCustomer(customer), body: '   ' }),
    ).rejects.toThrow(/empty/i);
    await expect(
      sendBookingMessage({
        bookingId: booking.id,
        viewer: asCustomer(customer),
        body: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/longer than/i);
  });

  it('closes the thread once the booking is cancelled', async () => {
    const { customer, booking } = await scenario();
    await db.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });

    await expect(
      sendBookingMessage({ bookingId: booking.id, viewer: asCustomer(customer), body: 'Hello' }),
    ).rejects.toThrow(/closed/i);
  });

  it('stays open after completion, because the guarantee window does', async () => {
    const { customer, booking } = await scenario();
    await db.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });

    const message = await sendBookingMessage({
      bookingId: booking.id,
      viewer: asCustomer(customer),
      body: 'Wohi masla wapis aa gaya hai.',
    });
    expect(message.id).toBeTruthy();
  });

  it('will not attach a file that is not the sender own', async () => {
    const { customer, stranger, booking } = await scenario();
    const theirs = await db.uploadedFile.create({
      data: {
        storageKey: 'm1',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        originalName: 'theirs.jpg',
        checksumSha256: 'a'.repeat(64),
        ownerId: stranger.id,
        bookingId: booking.id,
      },
    });

    await expect(
      sendBookingMessage({
        bookingId: booking.id,
        viewer: asCustomer(customer),
        body: 'Dekhein',
        attachmentId: theirs.id,
      }),
    ).rejects.toThrow(/attachment not found/i);
  });

  it('will not attach a file from a different booking', async () => {
    const { customer, booking, service, zone, address } = await scenario();
    const elsewhere = await createBooking({
      customerId: customer.id,
      serviceId: service.id,
      addressId: address.id,
      problemDescription: 'Ek aur masla bilkul alag',
      scheduledFor: tomorrowAt(),
    });
    void zone;

    const file = await db.uploadedFile.create({
      data: {
        storageKey: 'm2',
        driver: 'local',
        purpose: 'BOOKING_EVIDENCE',
        visibility: 'PRIVATE',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        originalName: 'other-job.jpg',
        checksumSha256: 'b'.repeat(64),
        ownerId: customer.id,
        bookingId: elsewhere.booking.id,
      },
    });

    await expect(
      sendBookingMessage({
        bookingId: booking.id,
        viewer: asCustomer(customer),
        body: 'Dekhein',
        attachmentId: file.id,
      }),
    ).rejects.toThrow(/attachment not found/i);
  });

  it('notifies the other side and nobody else', async () => {
    const { customer, assigned, booking } = await scenario();
    await sendBookingMessage({
      bookingId: booking.id,
      viewer: asCustomer(customer),
      body: 'Aap kitni der mein pohonchenge?',
    });

    expect(
      await db.notification.count({
        where: { userId: assigned.user.id, event: 'booking.message' },
      }),
    ).toBeGreaterThan(0);
    // The sender does not get told about their own message.
    expect(
      await db.notification.count({ where: { userId: customer.id, event: 'booking.message' } }),
    ).toBe(0);
  });

  it('counts unread messages, and stops once the thread is opened', async () => {
    const { customer, assigned, booking } = await scenario();

    await sendBookingMessage({
      bookingId: booking.id,
      viewer: asProvider(assigned.user, assigned.provider.id),
      body: 'Raste mein hoon',
    });
    expect(await unreadMessageCount(customer.id)).toBe(1);
    // The sender's own message is never unread for them.
    expect(await unreadMessageCount(assigned.user.id)).toBe(0);

    await markThreadRead(booking.id, customer.id);
    expect(await unreadMessageCount(customer.id)).toBe(0);
  });
});

describe('rescheduling', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('platform.commissionRateBp', 1000);
    await setSettingValue('booking.minLeadMinutes', 60);
    await setSettingValue('booking.maxLeadDays', 30);
  });

  const inDays = (days: number, hour = 15) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
  };

  it('moves the visit and tells the technician', async () => {
    const { customer, assigned, booking } = await scenario();
    const when = inDays(3);

    const updated = await rescheduleBooking({
      bookingId: booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      scheduledFor: when,
      reason: 'Us waqt ghar par koi nahi hoga',
    });

    expect(updated.scheduledFor?.getTime()).toBe(when.getTime());
    expect(
      await db.notification.count({
        where: { userId: assigned.user.id, event: 'booking.rescheduled' },
      }),
    ).toBeGreaterThan(0);
  });

  it('records who moved it, from when, to when', async () => {
    const { customer, booking } = await scenario();
    const before = booking.scheduledFor;
    const when = inDays(4);

    await rescheduleBooking({
      bookingId: booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      scheduledFor: when,
    });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: 'Booking', entityId: booking.id, action: 'booking.rescheduled' },
    });
    const metadata = entry.metadata as { from: string | null; to: string; by: string };
    expect(metadata.by).toBe('CUSTOMER');
    expect(metadata.to).toBe(when.toISOString());
    expect(metadata.from).toBe(before?.toISOString() ?? null);
  });

  it('lets the technician move it too', async () => {
    const { assigned, booking } = await scenario();
    const updated = await rescheduleBooking({
      bookingId: booking.id,
      actorUserId: assigned.user.id,
      actorRole: 'PROVIDER',
      actorProviderId: assigned.provider.id,
      scheduledFor: inDays(2),
    });
    expect(updated.scheduledFor).not.toBeNull();
  });

  it('refuses somebody who is not party to the booking', async () => {
    const { stranger, other, booking } = await scenario();

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: stranger.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(2),
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: other.user.id,
        actorRole: 'PROVIDER',
        actorProviderId: other.provider.id,
        scheduledFor: inDays(2),
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('refuses once the technician has set off', async () => {
    const { customer, booking } = await scenario();

    for (const status of ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const) {
      await db.booking.update({ where: { id: booking.id }, data: { status } });
      const failure = await rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(2),
      }).catch((error: AppError) => error);
      expect((failure as AppError).code).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  it('refuses on an emergency, which is "now" by definition', async () => {
    const { customer, booking } = await scenario();
    await db.booking.update({ where: { id: booking.id }, data: { isEmergency: true } });

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(2),
      }),
    ).rejects.toThrow(/emergency/i);
  });

  it('holds the new time to the same window a new booking would face', async () => {
    const { customer, booking } = await scenario();

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: new Date(Date.now() + 10 * 60_000),
      }),
    ).rejects.toThrow(/at least/i);

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(60),
      }),
    ).rejects.toThrow(/days ahead/i);
  });

  it('refuses a move to the time it is already at', async () => {
    const { customer, booking } = await scenario();
    const when = inDays(3);
    await rescheduleBooking({
      bookingId: booking.id,
      actorUserId: customer.id,
      actorRole: 'CUSTOMER',
      scheduledFor: when,
    });

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: when,
      }),
    ).rejects.toThrow(/already set to that time/i);
  });

  it('caps the moves, and says how many are left', async () => {
    const { customer, booking } = await scenario();
    expect(await reschedulesRemaining(booking.id)).toBe(3);

    for (let move = 1; move <= 3; move += 1) {
      await rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(move + 1),
      });
    }
    expect(await reschedulesRemaining(booking.id)).toBe(0);

    await expect(
      rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(9),
      }),
    ).rejects.toThrow(/cannot be moved more than/i);
  });

  it('lets staff move it past the cap, because that is what support is for', async () => {
    const { customer, admin, booking } = await scenario();
    for (let move = 1; move <= 3; move += 1) {
      await rescheduleBooking({
        bookingId: booking.id,
        actorUserId: customer.id,
        actorRole: 'CUSTOMER',
        scheduledFor: inDays(move + 1),
      });
    }

    const updated = await rescheduleBooking({
      bookingId: booking.id,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      scheduledFor: inDays(10),
      reason: 'Customer ne call par kaha',
    });
    expect(updated.scheduledFor?.getTime()).toBe(inDays(10).getTime());
  });
});
