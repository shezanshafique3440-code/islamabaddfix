'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

interface CallChannel {
  mode: 'masked' | 'direct';
  dialNumber: string | null;
  ringsYouFirst: boolean;
  callReference: string | null;
  counterpartName: string;
  numberIsReal: boolean;
  expiresInMinutes: number | null;
  note: string;
}

/**
 * Call the other party on a booking.
 *
 * Asks the server for a channel rather than dialling straight from a number in
 * the page, because whether the call is masked is a server-side fact. The
 * dialog says which mode is in force — a "private call" badge over an ordinary
 * `tel:` link would be a lie told in the one place people check.
 */
export function CallButton({
  bookingId,
  fallbackNumber,
}: {
  bookingId: string;
  fallbackNumber: string;
}) {
  const [channel, setChannel] = useState<CallChannel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setLoading(true);
    setError(null);
    try {
      setChannel(await api.post<CallChannel>(`/api/bookings/${bookingId}/call`));
    } catch (caught) {
      // Falling back to the number already on the page is better than a dead
      // button; the dialog is only there to explain masking.
      setError(caught instanceof ApiError ? caught.message : 'Could not set up the call.');
      setChannel({
        mode: 'direct',
        dialNumber: fallbackNumber,
        ringsYouFirst: false,
        callReference: null,
        counterpartName: 'your technician',
        numberIsReal: true,
        expiresInMinutes: null,
        note: 'This is the number shared with you for this booking.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="shrink-0"
        loading={loading}
        onClick={open}
        aria-label="Call the technician"
      >
        📞 Call
      </Button>

      {channel ? (
        <Dialog
          open
          onClose={() => setChannel(null)}
          title={`Call ${channel.counterpartName}`}
          description={
            channel.mode === 'masked'
              ? 'This goes through a platform number, so neither side sees the other’s real number.'
              : 'This is a direct call.'
          }
          footer={
            <>
              <Button variant="outline" onClick={() => setChannel(null)}>
                Close
              </Button>
              {/* In masked mode the platform rings the caller, so there is
                  nothing to dial and offering a dial button would be a lie. */}
              {channel.dialNumber ? (
                <a
                  href={`tel:${channel.dialNumber.replace(/\s+/g, '')}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-[0.9375rem] font-semibold text-white hover:bg-brand-800 dark:text-brand-50"
                >
                  Dial {channel.dialNumber}
                </a>
              ) : null}
            </>
          }
        >
          <div className="space-y-3">
            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-warn-50 px-3.5 py-2.5 text-sm leading-relaxed text-warn-700"
              >
                {error}
              </p>
            ) : null}
            <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-sm leading-relaxed text-ink-600">
              {channel.note}
            </p>
            {channel.ringsYouFirst ? (
              <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-brand-800">
                Keep this phone to hand — the call is coming to you.
              </p>
            ) : null}
            {channel.expiresInMinutes !== null ? (
              <p className="text-xs text-ink-500">
                The bridge stays open for {channel.expiresInMinutes} minutes.
              </p>
            ) : null}
            {channel.callReference ? (
              <p className="text-xs text-ink-500">
                Call reference {channel.callReference} — quote it if you need to report a problem
                with this call.
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
