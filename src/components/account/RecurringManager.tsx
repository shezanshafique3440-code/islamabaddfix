'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Select, TextInput, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime, plural } from '@/lib/utils';

export interface ScheduleView {
  id: string;
  reference: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  serviceName: string;
  addressLabel: string;
  providerName: string | null;
  summary: string;
  nextOccurrenceAt: string;
  bookingsCreated: number;
}

export interface ScheduleOptions {
  services: Array<{ id: string; name: string; categoryName: string }>;
  addresses: Array<{ id: string; label: string; addressLine: string }>;
  leadDays: number;
}

const FREQUENCIES = [
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'FORTNIGHTLY', label: 'Every two weeks' },
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'QUARTERLY', label: 'Every three months' },
] as const;

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

/**
 * Standing arrangements for work that repeats.
 *
 * The copy is careful about one thing: a repeat visit is not a subscription and
 * nothing about it is pre-priced. Each occurrence becomes an ordinary booking
 * with its own quote, which the customer approves like any other.
 */
export function RecurringManager({
  schedules,
  options,
}: {
  schedules: ScheduleView[];
  options: ScheduleOptions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<ScheduleView | null>(null);
  const [busy, setBusy] = useState(false);

  const setStatus = async (schedule: ScheduleView, status: 'ACTIVE' | 'PAUSED') => {
    setBusy(true);
    try {
      await api.patch(`/api/recurring/${schedule.id}`, { status });
      toast({ tone: 'success', title: status === 'ACTIVE' ? 'Resumed' : 'Paused' });
      router.refresh();
    } catch (caught) {
      toast({
        tone: 'error',
        title: 'Could not change it',
        description: caught instanceof ApiError ? caught.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => setCreating(true)} disabled={options.services.length === 0}>
          + Set up a repeat visit
        </Button>
      </div>

      {schedules.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="rounded-2xl border border-ink-200 bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">
                      {schedule.serviceName}
                    </span>
                    <Badge tone={schedule.status === 'ACTIVE' ? 'success' : 'warn'}>
                      {schedule.status === 'ACTIVE' ? 'Running' : 'Paused'}
                    </Badge>
                    <span className="text-xs text-ink-500">{schedule.reference}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{schedule.summary}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {schedule.addressLabel}
                    {schedule.providerName ? ` · prefers ${schedule.providerName}` : ''} ·{' '}
                    {plural(schedule.bookingsCreated, 'booking')} so far
                  </p>
                  {schedule.status === 'ACTIVE' ? (
                    <p className="mt-1.5 text-xs text-brand-700">
                      Next visit {formatDateTime(schedule.nextOccurrenceAt)} — the booking appears{' '}
                      {plural(options.leadDays, 'day')} before, and a technician is matched then.
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-ink-500">
                      Paused. Nothing is being booked. Resuming picks up from the next date, not the
                      ones that went by.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {schedule.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setStatus(schedule, 'PAUSED')}
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setStatus(schedule, 'ACTIVE')}
                    >
                      Resume
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEnding(schedule)}>
                    End
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-4"
          title="No repeat visits set up"
          description="For work that comes round again — office cleaning, an AC service before summer, a water tank clean. We create the booking a few days before each visit; you approve the quote as usual."
        />
      )}

      {creating ? (
        <CreateDialog
          options={options}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            toast({ tone: 'success', title: 'Repeat visit set up' });
            router.refresh();
          }}
        />
      ) : null}

      {ending ? (
        <ConfirmDialog
          open
          title={`End ${ending.reference}?`}
          description="No more bookings are created. Any booking already made stays exactly as it is — this only stops future ones."
          confirmLabel="End it"
          destructive
          loading={busy}
          onClose={() => setEnding(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.patch(`/api/recurring/${ending.id}`, { status: 'ENDED' });
              toast({ tone: 'info', title: 'Repeat visit ended' });
              setEnding(null);
              router.refresh();
            } catch (caught) {
              toast({
                tone: 'error',
                title: 'Could not end it',
                description: caught instanceof ApiError ? caught.message : undefined,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function CreateDialog({
  options,
  onClose,
  onDone,
}: {
  options: ScheduleOptions;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    serviceId: options.services[0]?.id ?? '',
    addressId: options.addresses[0]?.id ?? '',
    frequency: 'MONTHLY' as (typeof FREQUENCIES)[number]['value'],
    dayOfWeek: '2',
    dayOfMonth: '1',
    time: '10:00',
    problemDescription: '',
    maxOccurrences: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const monthly = form.frequency === 'MONTHLY' || form.frequency === 'QUARTERLY';

  const submit = async () => {
    setLoading(true);
    setError(null);
    const [hours, minutes] = form.time.split(':');
    try {
      await api.post('/api/recurring', {
        serviceId: form.serviceId,
        addressId: form.addressId,
        frequency: form.frequency,
        intervalCount: 1,
        timeOfDayMinutes: Number(hours ?? 0) * 60 + Number(minutes ?? 0),
        dayOfWeek: monthly ? null : Number(form.dayOfWeek),
        dayOfMonth: monthly ? Number(form.dayOfMonth) : null,
        problemDescription: form.problemDescription,
        maxOccurrences: form.maxOccurrences.trim() ? Number(form.maxOccurrences) : null,
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Set up a repeat visit"
      description="We create a booking a few days before each visit. Nothing is priced in advance — you approve a written quote every time, exactly as you do now."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={loading}
            disabled={form.problemDescription.trim().length < 10 || !form.serviceId}
          >
            Set it up
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl bg-alert-50 px-3.5 py-2.5 text-sm text-alert-700">
            {error}
          </p>
        ) : null}

        <Select
          label="Service"
          required
          value={form.serviceId}
          onChange={(event) => set('serviceId', event.target.value)}
        >
          {options.services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.categoryName} — {service.name}
            </option>
          ))}
        </Select>

        <Select
          label="Address"
          required
          value={form.addressId}
          onChange={(event) => set('addressId', event.target.value)}
        >
          {options.addresses.map((address) => (
            <option key={address.id} value={address.id}>
              {address.label} — {address.addressLine}
            </option>
          ))}
        </Select>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="How often"
            value={form.frequency}
            onChange={(event) =>
              set('frequency', event.target.value as (typeof FREQUENCIES)[number]['value'])
            }
          >
            {FREQUENCIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {monthly ? (
            <TextInput
              label="Day of the month"
              type="number"
              min={1}
              max={28}
              value={form.dayOfMonth}
              onChange={(event) => set('dayOfMonth', event.target.value)}
              hint="1–28, so every month actually has the day."
            />
          ) : (
            <Select
              label="Day"
              value={form.dayOfWeek}
              onChange={(event) => set('dayOfWeek', event.target.value)}
            >
              {DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Time"
            type="time"
            value={form.time}
            onChange={(event) => set('time', event.target.value)}
            hint="The arrival time, not the finish time."
          />
          <TextInput
            label="Number of visits (optional)"
            type="number"
            min={1}
            value={form.maxOccurrences}
            onChange={(event) => set('maxOccurrences', event.target.value)}
            hint="Leave blank to keep going until you stop it."
          />
        </div>

        <Textarea
          label="What needs doing"
          required
          rows={3}
          value={form.problemDescription}
          onChange={(event) => set('problemDescription', event.target.value)}
          placeholder="For example: deep clean of the office — three rooms, a kitchen and two bathrooms."
          hint="This is sent to the technician with every booking, so write it as you would once."
        />

        <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
          Each visit is booked {plural(options.leadDays, 'day')} beforehand and matched to a
          technician then — so the person who comes may differ between visits. You can pause or end
          this at any time, and pausing never books the visits that went by.
        </p>
      </div>
    </Dialog>
  );
}
