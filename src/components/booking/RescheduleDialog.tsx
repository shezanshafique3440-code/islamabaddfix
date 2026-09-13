'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

/**
 * Move a booking to a different time.
 *
 * Shows how many moves are left before offering the control, so nobody fills
 * the form in only to be told they have run out.
 */
export function RescheduleDialog({
  bookingId,
  current,
  remaining,
  minLeadMinutes,
  maxLeadDays,
  onDone,
}: {
  bookingId: string;
  current: string | null;
  remaining: number;
  minLeadMinutes: number;
  maxLeadDays: number;
  onDone?: (scheduledFor: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(current));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const earliest = toLocalInput(new Date(Date.now() + minLeadMinutes * 60_000).toISOString());
  const latest = toLocalInput(new Date(Date.now() + maxLeadDays * 24 * 3600_000).toISOString());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ scheduledFor: string }>(
        `/api/bookings/${bookingId}/reschedule`,
        { scheduledFor: new Date(value).toISOString(), reason: reason.trim() || undefined },
      );
      toast({ tone: 'success', title: 'Time changed' });
      setOpen(false);
      onDone?.(result.scheduledFor);
      // The booking detail is server-rendered; reload so every view agrees.
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not change the time.');
    } finally {
      setLoading(false);
    }
  }

  if (remaining <= 0) {
    return (
      <p className="text-xs text-ink-500">
        This booking has been rescheduled the maximum number of times. Please contact support.
      </p>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change time
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Change the booking time"
        description={`You can move it ${remaining} more time(s). The other side is told straight away.`}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
              <p className="text-sm font-medium text-alert-700">{error}</p>
            </div>
          ) : null}

          <TextInput
            label="New time"
            type="datetime-local"
            value={value}
            min={earliest}
            max={latest}
            onChange={(event) => setValue(event.target.value)}
            required
            hint={`At least ${minLeadMinutes} minutes from now, and within ${maxLeadDays} days.`}
          />
          <TextInput
            label="Reason (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 300))}
            placeholder="For example: nobody will be home at that time"
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Leave it
            </Button>
            <Button type="submit" loading={loading} disabled={!value}>
              Confirm time
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** `datetime-local` wants local wall-clock time with no zone suffix. */
function toLocalInput(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
