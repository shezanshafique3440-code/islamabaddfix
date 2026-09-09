import type { NotificationChannel } from '@prisma/client';
import type { NotificationEvent } from './events';

export interface NotificationPayload {
  event: NotificationEvent;
  /** Recipient user id. */
  userId: string;
  title: string;
  body: string;
  /** In-app deep link, also used as the CTA target in email. */
  href?: string;
  data?: Record<string, unknown>;
  /** Channels to attempt. Defaults to the platform's enabled channel set. */
  channels?: NotificationChannel[];
}

export interface DeliveryTarget {
  userId: string;
  email: string;
  phone: string | null;
  fullName: string;
}

export type DeliveryOutcome =
  | { status: 'SENT'; providerRef?: string }
  | { status: 'FAILED'; reason: string }
  | { status: 'SKIPPED_NOT_CONFIGURED'; reason: string };

/**
 * A delivery channel. Implementations must never claim success when their
 * integration is unconfigured — they return SKIPPED_NOT_CONFIGURED so the
 * notification row records the truth.
 */
export interface NotificationChannelDriver {
  readonly channel: NotificationChannel;
  /** False when credentials are missing; dispatch records a skip. */
  isConfigured(): boolean;
  send(target: DeliveryTarget, payload: NotificationPayload): Promise<DeliveryOutcome>;
}
