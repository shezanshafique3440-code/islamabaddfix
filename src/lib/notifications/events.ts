/**
 * Notification event catalogue.
 *
 * Each event declares who it goes to and how to render it. Adding an event
 * means adding one entry here — dispatch, templating and channel selection all
 * derive from this table.
 */

export const NOTIFICATION_EVENTS = {
  BOOKING_CREATED: 'booking.created',
  PROVIDER_NOTIFIED: 'booking.provider_notified',
  BOOKING_ACCEPTED: 'booking.accepted',
  BOOKING_DECLINED: 'booking.declined',
  QUOTE_RECEIVED: 'quote.received',
  QUOTE_APPROVED: 'quote.approved',
  QUOTE_REJECTED: 'quote.rejected',
  BOOKING_SCHEDULED: 'booking.scheduled',
  PROVIDER_ON_THE_WAY: 'booking.on_the_way',
  PROVIDER_ARRIVED: 'booking.arrived',
  JOB_STARTED: 'booking.started',
  JOB_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_RECORDED: 'payment.recorded',
  REVIEW_REQUESTED: 'review.requested',
  GUARANTEE_REMINDER: 'guarantee.reminder',
  GUARANTEE_UPDATE: 'guarantee.update',
  DISPUTE_OPENED: 'dispute.opened',
  DISPUTE_UPDATE: 'dispute.update',
  PROVIDER_APPROVED: 'provider.approved',
  PROVIDER_REJECTED: 'provider.rejected',
  PROVIDER_SUSPENDED: 'provider.suspended',
  SUPPORT_TICKET_UPDATE: 'support.update',
  PASSWORD_RESET: 'auth.password_reset',
  PASSWORD_CHANGED: 'auth.password_changed',
  EMAIL_VERIFICATION: 'auth.email_verification',
  PHONE_VERIFICATION: 'auth.phone_verification',
  BOOKING_RESCHEDULED: 'booking.rescheduled',
  NEW_MESSAGE: 'booking.message',
} as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];
