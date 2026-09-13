'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';

/**
 * Confirmation screen.
 *
 * Tells the customer exactly what happens next, and is honest when no
 * technician was matched: the request is real and queued for the ops team, not
 * silently dropped.
 */
export function StepDone({
  booking,
  serviceName,
  isEmergency,
}: {
  booking: {
    id: string;
    reference: string;
    providersNotified: number;
    awaitingManualAssignment: boolean;
  };
  serviceName: string;
  isEmergency: boolean;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-brand-700"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7 9.5 16.2Z" />
          </svg>
        </span>

        <h1 className="mt-4 text-display-sm text-ink-950">
          {isEmergency ? 'Emergency request sent' : 'Booking confirmed'}
        </h1>

        <p className="mt-2 text-sm text-ink-600">
          {serviceName} · Booking ID{' '}
          <strong className="font-mono font-semibold text-ink-900">{booking.reference}</strong>
        </p>

        <div className="mt-6 rounded-xl bg-ink-50 p-4 text-left">
          <p className="text-sm font-semibold text-ink-900">What happens next?</p>
          <ol className="mt-2.5 space-y-2 text-sm text-ink-700">
            {booking.awaitingManualAssignment ? (
              <li className="flex gap-2.5">
                <Step n={1} />
                <span>
                  No automatic match right now, so our ops team will find and assign a technician
                  for you. You will get a notification.
                </span>
              </li>
            ) : (
              <li className="flex gap-2.5">
                <Step n={1} />
                <span>
                  {booking.providersNotified === 1
                    ? 'The request has been sent to the technician.'
                    : `Your request went out to ${booking.providersNotified} technicians.`}{' '}
                  You will be notified when it is accepted.
                </span>
              </li>
            )}
            <li className="flex gap-2.5">
              <Step n={2} />
              <span>The technician inspects and sends a written quote.</span>
            </li>
            <li className="flex gap-2.5">
              <Step n={3} />
              <span>
                You approve the quote — only then does work start and the time get confirmed.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Step n={4} />
              <span>When the work is complete, record the payment and leave a review.</span>
            </li>
          </ol>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <ButtonLink href={`/account/bookings/${booking.id}`} size="lg">
            Track booking
          </ButtonLink>
          <ButtonLink href="/account" variant="outline" size="lg">
            My bookings
          </ButtonLink>
        </div>

        <p className="mt-5 text-xs text-ink-500">
          Need to change something? From the{' '}
          <Link
            href={`/account/bookings/${booking.id}`}
            className="font-medium text-brand-700 hover:underline"
          >
            booking page
          </Link>{' '}
          you can cancel it or contact support.
        </p>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[0.625rem] font-bold text-white">
      {n}
    </span>
  );
}
