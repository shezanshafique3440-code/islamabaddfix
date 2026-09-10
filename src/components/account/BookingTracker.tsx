import type { BookingStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

const STEPS: Array<{ status: BookingStatus; label: string }> = [
  { status: 'PENDING', label: 'Request bheji' },
  { status: 'ACCEPTED', label: 'Technician mil gaya' },
  { status: 'SCHEDULED', label: 'Time confirm' },
  { status: 'ON_THE_WAY', label: 'Raste mein' },
  { status: 'ARRIVED', label: 'Pohonch gaya' },
  { status: 'IN_PROGRESS', label: 'Kaam chal raha' },
  { status: 'COMPLETED', label: 'Mukammal' },
];

/**
 * Progress tracker.
 *
 * Vertical on a phone, horizontal on desktop. Terminal failures (cancelled,
 * refunded) replace the tracker rather than showing a half-filled bar, which
 * would read as "still in progress".
 */
export function BookingTracker({
  status,
  step,
  className,
}: {
  status: BookingStatus;
  step: number;
  className?: string;
}) {
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    return (
      <div className={cn('rounded-xl bg-ink-100 px-4 py-3', className)}>
        <p className="text-sm font-medium text-ink-700">
          {status === 'CANCELLED' ? 'Yeh booking cancel ho gayi.' : 'Yeh booking refund ho gayi.'}
        </p>
      </div>
    );
  }

  if (status === 'DISPUTED') {
    return (
      <div className={cn('rounded-xl bg-alert-50 px-4 py-3', className)}>
        <p className="text-sm font-medium text-alert-700">
          Is booking par dispute khula hai — ops team dekh rahi hai.
        </p>
      </div>
    );
  }

  return (
    <ol className={cn('flex flex-col gap-0 sm:flex-row sm:items-start', className)}>
      {STEPS.map((entry, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li key={entry.status} className="flex flex-1 gap-3 sm:flex-col sm:gap-2">
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold',
                  done && 'bg-brand-600 text-white',
                  current && 'bg-ink-900 text-white ring-4 ring-ink-900/10',
                  !done && !current && 'bg-ink-200 text-ink-500',
                )}
              >
                {done ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                    <path d="M4.6 8.4 2.2 6l-.9.9 3.3 3.3 6-6-.9-.9-5.1 5.1Z" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-px flex-1 sm:h-px sm:w-full',
                    done ? 'bg-brand-300' : 'bg-ink-200',
                  )}
                />
              ) : null}
            </div>
            <p
              className={cn(
                'pb-4 text-xs sm:pb-0',
                current ? 'font-semibold text-ink-900' : done ? 'text-ink-600' : 'text-ink-400',
              )}
            >
              {entry.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
