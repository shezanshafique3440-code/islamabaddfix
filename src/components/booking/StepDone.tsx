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
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-brand-700" fill="currentColor" aria-hidden="true">
            <path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7 9.5 16.2Z" />
          </svg>
        </span>

        <h1 className="mt-4 text-display-sm text-ink-950">
          {isEmergency ? 'Emergency request bhej di gayi' : 'Booking confirm ho gayi'}
        </h1>

        <p className="mt-2 text-sm text-ink-600">
          {serviceName} · Booking ID{' '}
          <strong className="font-mono font-semibold text-ink-900">{booking.reference}</strong>
        </p>

        <div className="mt-6 rounded-xl bg-ink-50 p-4 text-left">
          <p className="text-sm font-semibold text-ink-900">Ab kya hoga?</p>
          <ol className="mt-2.5 space-y-2 text-sm text-ink-700">
            {booking.awaitingManualAssignment ? (
              <li className="flex gap-2.5">
                <Step n={1} />
                <span>
                  Is waqt automatic match nahi mila, is liye humari ops team aap ke liye technician
                  dhoond kar assign karegi. Aap ko notification mil jayega.
                </span>
              </li>
            ) : (
              <li className="flex gap-2.5">
                <Step n={1} />
                <span>
                  {booking.providersNotified === 1
                    ? 'Technician ko request bhej di gayi hai.'
                    : `${booking.providersNotified} technicians ko request bhej di gayi hai.`}{' '}
                  Qubool karne par aap ko notification milega.
                </span>
              </li>
            )}
            <li className="flex gap-2.5">
              <Step n={2} />
              <span>Technician muaina karke likhit quote bhejega.</span>
            </li>
            <li className="flex gap-2.5">
              <Step n={3} />
              <span>
                Aap quote approve karein — uske baad hi kaam shuru hoga aur time confirm hoga.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Step n={4} />
              <span>Kaam mukammal hone par payment record karein aur review dein.</span>
            </li>
          </ol>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <ButtonLink href={`/account/bookings/${booking.id}`} size="lg">
            Booking track karein
          </ButtonLink>
          <ButtonLink href="/account" variant="outline" size="lg">
            Meri bookings
          </ButtonLink>
        </div>

        <p className="mt-5 text-xs text-ink-500">
          Kuch badalna hai?{' '}
          <Link href={`/account/bookings/${booking.id}`} className="font-medium text-brand-700 hover:underline">
            Booking page
          </Link>{' '}
          se cancel ya support se rabta kar sakte hain.
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
