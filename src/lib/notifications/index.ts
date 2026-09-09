import type { NotificationChannel } from '@prisma/client';
import { prisma } from '../db';
import { getSetting } from '../settings';
import { inAppChannel } from './channels/in-app';
import { emailChannel } from './channels/email';
import { smsChannel } from './channels/sms';
import { whatsappChannel } from './channels/whatsapp';
import { pushChannel } from './channels/push';
import type { DeliveryTarget, NotificationChannelDriver, NotificationPayload } from './types';

export * from './events';
export type { NotificationPayload } from './types';

const DRIVERS: Record<NotificationChannel, NotificationChannelDriver> = {
  IN_APP: inAppChannel,
  EMAIL: emailChannel,
  SMS: smsChannel,
  WHATSAPP: whatsappChannel,
  PUSH: pushChannel,
};

/**
 * Dispatch one notification across the enabled channels.
 *
 * A Notification row is written per channel *before* the send is attempted, so
 * the database always reflects what was tried, including skips for
 * unconfigured integrations. Failures never propagate to the caller — a
 * booking must not fail because email is down.
 */
export async function notify(payload: NotificationPayload): Promise<void> {
  try {
    const user = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true, deletedAt: null },
      select: { id: true, email: true, phone: true, fullName: true },
    });
    if (!user) return;

    const target: DeliveryTarget = {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
    };
    const channels = await resolveChannels(payload.channels);
    await Promise.all(channels.map((channel) => deliver(DRIVERS[channel], target, payload)));
  } catch (error) {
    console.error('[notifications] dispatch failed', {
      event: payload.event,
      userId: payload.userId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/** Fan a notification out to several recipients. */
export async function notifyMany(
  userIds: string[],
  payload: Omit<NotificationPayload, 'userId'>,
): Promise<void> {
  await Promise.all(userIds.map((userId) => notify({ ...payload, userId })));
}

/** Notify every active admin — used for disputes and verification queues. */
export async function notifyAdmins(payload: Omit<NotificationPayload, 'userId'>): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  await notifyMany(
    admins.map((a) => a.id),
    payload,
  );
}

async function resolveChannels(requested?: NotificationChannel[]): Promise<NotificationChannel[]> {
  const enabled = await getSetting('notifications.channels');
  const all: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'];
  const enabledSet = all.filter((channel) => {
    switch (channel) {
      case 'IN_APP':
        return enabled.inApp;
      case 'EMAIL':
        return enabled.email;
      case 'SMS':
        return enabled.sms;
      case 'WHATSAPP':
        return enabled.whatsapp;
      case 'PUSH':
        return enabled.push;
    }
  });
  if (!requested) return enabledSet;
  return requested.filter((channel) => enabledSet.includes(channel));
}

async function deliver(
  driver: NotificationChannelDriver,
  target: DeliveryTarget,
  payload: NotificationPayload,
): Promise<void> {
  const record = await prisma.notification.create({
    data: {
      userId: target.userId,
      channel: driver.channel,
      event: payload.event,
      title: payload.title,
      body: payload.body,
      href: payload.href ?? null,
      data: (payload.data ?? {}) as object,
      status: 'PENDING',
    },
  });

  const outcome = await driver.send(target, payload).catch((error: unknown) => ({
    status: 'FAILED' as const,
    reason: error instanceof Error ? error.message : 'Unknown error',
  }));

  await prisma.notification.update({
    where: { id: record.id },
    data:
      outcome.status === 'SENT'
        ? { status: 'SENT', sentAt: new Date() }
        : { status: outcome.status, failureReason: outcome.reason },
  });
}

// ------------------------------------------------------------- read/unread API

export async function listNotifications(
  userId: string,
  options?: { unreadOnly?: boolean; take?: number; cursor?: string },
) {
  return prisma.notification.findMany({
    where: {
      userId,
      channel: 'IN_APP',
      ...(options?.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options?.take ?? 25,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
}

export function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, channel: 'IN_APP', readAt: null },
  });
}

export async function markRead(userId: string, notificationId?: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      channel: 'IN_APP',
      readAt: null,
      ...(notificationId ? { id: notificationId } : {}),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Which channels are actually usable right now — surfaced in admin settings. */
export function channelStatus(): Array<{ channel: NotificationChannel; configured: boolean }> {
  return (Object.keys(DRIVERS) as NotificationChannel[]).map((channel) => ({
    channel,
    configured: DRIVERS[channel].isConfigured(),
  }));
}
