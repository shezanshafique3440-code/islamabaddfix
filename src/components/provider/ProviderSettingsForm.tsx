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
      toast({ tone: 'success', title: 'Settings save ho gayi' });
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
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Kaam ki capacity</h2>
          <div className="mt-4 space-y-4">
            <TextInput
              label="Ek waqt mein maximum jobs"
              type="number"
              min={1}
              max={50}
              value={form.maxActiveJobs}
              onChange={(event) => setForm((f) => ({ ...f, maxActiveJobs: event.target.value }))}
              error={errors.maxActiveJobs}
              hint="Itni active jobs hone par nayi requests aana band ho jayengi."
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

        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Emergency service</h2>
          <div className="mt-4 space-y-4">
            <Checkbox
              label="Main emergency calls leta hoon"
              checked={form.emergencyAvailable}
              onChange={(event) =>
                setForm((f) => ({ ...f, emergencyAvailable: event.target.checked }))
              }
              hint="Emergency jobs raat aur chhutti mein bhi aa sakti hain."
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
                hint={`Maximum ${formatPaisa(maxEmergencyFeePaisa)}. Customer ko booking se pehle dikhayi jati hai.`}
              />
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Location sharing</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            On karne par aap ki location sirf ops team ke dispatch map par dikhti hai — customers ko
            nahi. Record sirf 24 ghante rakha jata hai.
          </p>
          <div className="mt-4">
            <Checkbox
              label="Ops team ke saath live location share karein"
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
                {storedLocationCount} location record mojood hai. Off karne par sab mit jayenge.
              </p>
            ) : null}
          </div>
        </section>

        <Button type="submit" loading={loading}>
          Settings save karein
        </Button>
      </form>

      <ConfirmDialog
        open={confirmLocationOff}
        onClose={() => setConfirmLocationOff(false)}
        title="Location sharing off karein?"
        description="Aap ki mojooda location history bhi mita di jayegi. Yeh wapis nahi aayegi."
        confirmLabel="Off karein aur mitayein"
        destructive
        loading={loading}
        onConfirm={async () => {
          setLoading(true);
          try {
            await api.delete('/api/provider/location');
            setForm((f) => ({ ...f, shareLiveLocation: false }));
            toast({ tone: 'success', title: 'Location sharing off, history mit gayi' });
            setConfirmLocationOff(false);
            router.refresh();
          } catch (error) {
            toast({
              tone: 'error',
              title: 'Off nahi ho saka',
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
