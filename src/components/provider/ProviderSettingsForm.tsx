'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Checkbox, TextInput } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { formatPaisa } from '@/lib/money';

/**
 * Provider-controlled settings.
 *
 * Location sharing is opt-in and reversible: turning it off also deletes the
 * stored trail, and the copy states exactly who can see the position and for
 * how long it is kept.
 */
export function ProviderSettingsForm({
  initial,
  maxEmergencyFeePaisa,
  storedLocationCount,
}: {
  initial: {
    shareLiveLocation: boolean;
    maxActiveJobs: number;
    emergencyAvailable: boolean;
    emergencyFeeRupees: number;
    serviceRadiusKm: number;
  };
  maxEmergencyFeePaisa: number;
  storedLocationCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({
    shareLiveLocation: initial.shareLiveLocation,
    maxActiveJobs: String(initial.maxActiveJobs),
    emergencyAvailable: initial.emergencyAvailable,
    emergencyFeeRupees: String(initial.emergencyFeeRupees),
    serviceRadiusKm: String(initial.serviceRadiusKm),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [confirmLocationOff, setConfirmLocationOff] = useState(false);

  async function save(overrides?: Partial<typeof form>) {
    const next = { ...form, ...overrides };
    setLoading(true);
    setErrors({});
    try {
      await api.patch('/api/provider/settings', {
        shareLiveLocation: next.shareLiveLocation,
        maxActiveJobs: Number(next.maxActiveJobs) || 1,
        emergencyAvailable: next.emergencyAvailable,
        ...(next.emergencyAvailable
          ? { emergencyFeeRupees: Number(next.emergencyFeeRupees) || 0 }
          : {}),
        serviceRadiusKm: Number(next.serviceRadiusKm) || 15,
      });
      toast({ tone: 'success', title: 'Settings saved' });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldMap);
        toast({ tone: 'error', title: error.message });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Work capacity</h2>
          <div className="mt-4 space-y-4">
            <TextInput
              label="Maximum jobs at one time"
              type="number"
              min={1}
              max={50}
              value={form.maxActiveJobs}
              onChange={(event) => setForm((f) => ({ ...f, maxActiveJobs: event.target.value }))}
              error={errors.maxActiveJobs}
              hint="Once you have this many active jobs, new requests stop coming in."
            />
            <TextInput
              label="Service radius (km)"
              type="number"
              min={1}
              max={100}
              value={form.serviceRadiusKm}
              onChange={(event) => setForm((f) => ({ ...f, serviceRadiusKm: event.target.value }))}
              error={errors.serviceRadiusKm}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Emergency service</h2>
          <div className="mt-4 space-y-4">
            <Checkbox
              label="I take emergency calls"
              checked={form.emergencyAvailable}
              onChange={(event) =>
                setForm((f) => ({ ...f, emergencyAvailable: event.target.checked }))
              }
              hint="Emergency jobs can come at night and on holidays too."
            />
            {form.emergencyAvailable ? (
              <TextInput
                label="Emergency fee (Rs.)"
                type="number"
                min={0}
                value={form.emergencyFeeRupees}
                onChange={(event) =>
                  setForm((f) => ({ ...f, emergencyFeeRupees: event.target.value }))
                }
                error={errors.emergencyFeeRupees}
                hint={`Maximum ${formatPaisa(maxEmergencyFeePaisa)}. Shown to the customer before booking.`}
              />
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Location sharing</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            When on, your location appears only on the ops team’s dispatch map — never to customers.
            The record is kept for 24 hours only.
          </p>
          <div className="mt-4">
            <Checkbox
              label="Share live location with the ops team"
              checked={form.shareLiveLocation}
              onChange={(event) => {
                if (!event.target.checked && storedLocationCount > 0) {
                  setConfirmLocationOff(true);
                  return;
                }
                setForm((f) => ({ ...f, shareLiveLocation: event.target.checked }));
              }}
            />
            {storedLocationCount > 0 ? (
              <p className="mt-2 text-xs text-ink-500">
                {storedLocationCount} location record(s) stored. Turning this off erases them all.
              </p>
            ) : null}
          </div>
        </section>

        <Button type="submit" loading={loading}>
          Save settings
        </Button>
      </form>

      <ConfirmDialog
        open={confirmLocationOff}
        onClose={() => setConfirmLocationOff(false)}
        title="Turn off location sharing?"
        description="Your location history is deleted as well. It does not come back."
        confirmLabel="Turn off and erase"
        destructive
        loading={loading}
        onConfirm={async () => {
          setLoading(true);
          try {
            await api.delete('/api/provider/location');
            setForm((f) => ({ ...f, shareLiveLocation: false }));
            toast({ tone: 'success', title: 'Location sharing off, history erased' });
            setConfirmLocationOff(false);
            router.refresh();
          } catch (error) {
            toast({
              tone: 'error',
              title: 'Could not turn off',
              description: error instanceof ApiError ? error.message : undefined,
            });
          } finally {
            setLoading(false);
          }
        }}
      />
    </>
  );
}
