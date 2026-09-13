import type { BookingStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-brand-50 text-brand-800 ring-brand-200',
  warn: 'bg-warn-50 text-warn-700 ring-warn-200',
  danger: 'bg-alert-50 text-alert-700 ring-alert-200',
  info: 'bg-info-50 text-info-700 ring-info-100',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  dot,
  live,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
  /** A dot with one expanding ring behind it, for a genuinely live state. */
  live?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {live ? (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : dot ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}

/** Tone per booking status, so status colour is consistent everywhere. */
const STATUS_TONES: Record<BookingStatus, Tone> = {
  PENDING: 'neutral',
  PROVIDER_NOTIFIED: 'info',
  ACCEPTED: 'info',
  QUOTE_PENDING: 'warn',
  QUOTE_APPROVED: 'info',
  SCHEDULED: 'info',
  ON_THE_WAY: 'brand',
  ARRIVED: 'brand',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  DISPUTED: 'danger',
  REFUNDED: 'neutral',
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BookingStatus;
  label: string;
  className?: string;
}) {
  const tone = STATUS_TONES[status];
  // A live job gets a pulsing dot: the customer is watching this screen.
  const isLive = status === 'ON_THE_WAY' || status === 'ARRIVED' || status === 'IN_PROGRESS';
  return (
    <Badge tone={tone} className={className}>
      <span
        className={cn('h-1.5 w-1.5 rounded-full bg-current', isLive && 'animate-pulse')}
        aria-hidden="true"
      />
      {label}
    </Badge>
  );
}

/**
 * Verification badge. Only rendered from an APPROVED ProviderVerification row —
 * the copy deliberately says what was checked and nothing more.
 */
export function VerifiedBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium text-brand-700', className)}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8 1.5 9.9 3l2.4-.1.6 2.3 1.9 1.4-1 2.2.4 2.4-2.3.8L10.4 14 8 13.2 5.6 14 4.1 12l-2.3-.8.4-2.4-1-2.2L3.1 5l.6-2.3L6.1 3 8 1.5Zm3 4.3-3.8 4.1-2.2-2 .8-.9 1.3 1.2 3-3.2.9.8Z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </span>
  );
}

/** Marks seeded sample data so it is never mistaken for a real customer. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warn" className={cn('font-medium', className)}>
      Demo data
    </Badge>
  );
}
