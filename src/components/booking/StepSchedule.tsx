'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { formatPaisa } from '@/lib/money';
import { StepFooter, StepShell } from './WizardProgress';
import type { BookingDraft, FlatService, WizardConfig } from './types';

/**
 * Step 5 — date and time.
 *
 * The slot grid is built from the platform's configured lead-time window, so a
 * customer can never pick a time the API would reject. Emergency bookings skip
 * the grid entirely: "now" is the whole point, and the fee is disclosed here
 * rather than at the end.
 */
const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export function StepSchedule({
  draft,
  patch,
  service,
  config,
  onNext,
  onBack,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  service: FlatService | null;
  config: WizardConfig;
  onNext: () => void;
  onBack: () => void;
}) {
  const days = useMemo(() => buildDays(config.maxLeadDays), [config.maxLeadDays]);
  const selected = draft.scheduledFor ? new Date(draft.scheduledFor) : null;

  const [activeDay, setActiveDay] = useState<string>(() =>
    (selected ?? days[0]?.date ?? new Date()).toISOString().slice(0, 10),
  );

  const emergencyAllowed = config.emergencyEnabled && (service?.isEmergencyEnabled ?? false);

  const slots = useMemo(() => {
    // The lead-time cut-off is computed inside the memo: built outside it, a new
    // Date on every render would defeat the memo entirely. Recomputing it when
    // the selected day changes is exactly the freshness this needs.
    const earliest = Date.now() + config.minLeadMinutes * 60_000;
    const day = new Date(`${activeDay}T00:00:00`);
    return SLOT_HOURS.map((hour) => {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      return { hour, slot, disabled: slot.getTime() < earliest };
    });
  }, [activeDay, config.minLeadMinutes]);

  return (
    <StepShell
      title="When should we come?"
      description={
        draft.isEmergency
          ? 'For an emergency booking we look for technicians who are available right now.'
          : `Pick a slot at least ${config.minLeadMinutes} minutes from now.`
      }
    >
      <div className="space-y-5">
        {emergencyAllowed ? (
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
              draft.isEmergency
                ? 'border-alert-300 bg-alert-50 ring-1 ring-alert-300'
                : 'border-ink-200 hover:bg-ink-50',
            )}
          >
            <input
              type="checkbox"
              checked={draft.isEmergency}
              onChange={(event) =>
                patch({
                  isEmergency: event.target.checked,
                  urgency: event.target.checked ? 'EMERGENCY' : 'NORMAL',
                  // An emergency has no chosen slot; the request goes out now.
                  scheduledFor: event.target.checked ? null : draft.scheduledFor,
                  providerId: null,
                })
              }
              className="mt-0.5 h-[1.125rem] w-[1.125rem] rounded border-ink-300 text-alert-600 focus:ring-alert-500"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                🚨 Emergency — needed right now
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-600">
                Only technicians available for emergencies are shown. The emergency fee is set by
                their own rate (default {formatPaisa(config.defaultEmergencyFeePaisa)}) and is shown
                clearly before you confirm.
              </span>
            </span>
          </label>
        ) : null}

        {draft.isEmergency ? (
          <div className="rounded-xl border border-alert-200 bg-alert-50 p-4">
            <p className="text-sm font-medium text-alert-700">
              The emergency request goes out immediately.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-700">
              If there is fire, a gas leak or an injury, call Rescue 1122 first.
            </p>
          </div>
        ) : (
          <>
            {/* Day strip */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Din</p>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                {days.map((day) => {
                  const key = day.date.toISOString().slice(0, 10);
                  const active = key === activeDay;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveDay(key)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-16 shrink-0 flex-col items-center rounded-xl border py-2.5 transition-colors',
                        active
                          ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                          : 'border-ink-200 bg-surface hover:bg-ink-50',
                      )}
                    >
                      <span className="text-[0.6875rem] font-medium uppercase text-ink-500">
                        {day.label}
                      </span>
                      <span className="mt-0.5 text-lg font-bold leading-none text-ink-900">
                        {day.date.getDate()}
                      </span>
                      <span className="mt-0.5 text-[0.6875rem] text-ink-500">{day.month}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slots */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Time
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map(({ hour, slot, disabled }) => {
                  const isSelected = selected !== null && selected.getTime() === slot.getTime();
                  return (
                    <button
                      key={hour}
                      type="button"
                      disabled={disabled}
                      onClick={() => patch({ scheduledFor: slot.toISOString() })}
                      aria-pressed={isSelected}
                      className={cn(
                        'h-11 rounded-xl border text-sm font-medium transition-colors',
                        isSelected
                          ? 'border-brand-600 bg-brand-700 text-white dark:text-brand-50'
                          : disabled
                            ? 'cursor-not-allowed border-ink-100 bg-ink-50 text-ink-300'
                            : 'border-ink-200 bg-surface text-ink-800 hover:border-brand-300 hover:bg-brand-50',
                      )}
                    >
                      {formatHour(hour)}
                    </button>
                  );
                })}
              </div>
              {slots.every((slot) => slot.disabled) ? (
                <p className="mt-2 text-sm text-ink-500">
                  Every slot today has passed — pick another day.
                </p>
              ) : null}
            </div>

            {service ? (
              <p className="text-xs text-ink-500">
                The technician will need about {service.estimatedMinutes} minutes. The slot is the
                arrival time, not the time the work finishes.
              </p>
            ) : null}
          </>
        )}

        {selected && !draft.isEmergency ? (
          <Badge tone="brand">
            Selected:{' '}
            {selected.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
          </Badge>
        ) : null}
      </div>

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!draft.isEmergency && draft.scheduledFor === null}
        nextLabel="See technicians"
      />
    </StepShell>
  );
}

function buildDays(maxLeadDays: number) {
  const count = Math.min(14, maxLeadDays);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return Array.from({ length: count }).map((_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return {
      date,
      label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : (dayNames[date.getDay()] ?? ''),
      month: monthNames[date.getMonth()] ?? '',
    };
  });
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}
