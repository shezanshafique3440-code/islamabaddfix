'use client';

import { useState } from 'react';
import { NotConfiguredNotice } from '@/components/ui/EmptyState';
import { RadioCard, Select, TextInput } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { StepFooter, StepShell } from './WizardProgress';
import type { AddressOption, BookingDraft, NewAddressDraft, ZoneOption } from './types';

const EMPTY_ADDRESS: NewAddressDraft = {
  label: 'Home',
  zoneId: null,
  addressLine: '',
  houseOrBuilding: '',
  landmark: '',
  contactPhone: '',
  latitude: null,
  longitude: null,
  saveForLater: true,
};

/**
 * Step 4 — location.
 *
 * Works fully without a maps integration, which is the expected launch state:
 * sector plus a written address is how Islamabad addresses actually work.
 * Browser GPS is offered as an optional accuracy improvement — it needs no API
 * key — and its absence changes nothing about whether the booking can proceed.
 */
export function StepLocation({
  draft,
  patch,
  zones,
  addresses,
  isSignedIn,
  mapsConfigured,
  onNext,
  onBack,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  zones: ZoneOption[];
  addresses: AddressOption[];
  isSignedIn: boolean;
  mapsConfigured: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'saved' | 'new'>(
    addresses.length > 0 && draft.addressId ? 'saved' : 'new',
  );
  const [form, setForm] = useState<NewAddressDraft>(draft.newAddress ?? EMPTY_ADDRESS);
  const [locating, setLocating] = useState(false);

  function updateForm(updates: Partial<NewAddressDraft>) {
    const next = { ...form, ...updates };
    setForm(next);
    patch({ newAddress: next, addressId: null });
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      toast({ tone: 'error', title: 'Is browser mein GPS available nahi hai.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateForm({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
        toast({
          tone: 'success',
          title: 'Location mil gayi',
          description: 'Is se technician ko sahi jagah pohanchne mein asani hogi.',
        });
      },
      (error) => {
        setLocating(false);
        toast({
          tone: 'error',
          title: 'Location nahi mil saki',
          description:
            error.code === error.PERMISSION_DENIED
              ? 'Aap ne ijazat nahi di. Address manually likh dein — bilkul theek hai.'
              : 'Koi baat nahi, address manually likh dein.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const canProceed =
    mode === 'saved'
      ? Boolean(draft.addressId)
      : form.addressLine.trim().length >= 5 && form.zoneId !== null;

  return (
    <StepShell
      title="Kahan aana hai?"
      description="Sector aur address likh dein. GPS optional hai — address se bhi kaam ho jata hai."
    >
      <div className="space-y-5">
        {addresses.length > 0 ? (
          <div className="flex gap-2">
            {(
              [
                { value: 'saved', label: 'Saved address' },
                { value: 'new', label: 'Naya address' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={mode === option.value}
                className={
                  mode === option.value
                    ? 'h-10 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white'
                    : 'h-10 rounded-xl border border-ink-300 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {mode === 'saved' ? (
          <div className="space-y-2">
            {addresses.map((address) => (
              <RadioCard
                key={address.id}
                checked={draft.addressId === address.id}
                onSelect={() => patch({ addressId: address.id, newAddress: null })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{address.label}</span>
                      {address.isDefault ? <Badge tone="neutral">Default</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-600">{address.addressLine}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {address.zoneName ?? address.city}
                    </p>
                  </div>
                </div>
              </RadioCard>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {!mapsConfigured ? (
              <NotConfiguredNotice
                feature="Map picker"
                detail="Is deployment par maps configured nahi hai, is liye map pin available nahi. Sector aur address likh dein — booking mukammal ho jayegi. GPS button phir bhi kaam karta hai."
              />
            ) : null}

            <Select
              label="Sector / area"
              required
              value={form.zoneId ?? ''}
              onChange={(event) => updateForm({ zoneId: event.target.value || null })}
              hint="Aapka area list mein na ho to support ko bata dein."
            >
              <option value="">Area chunein</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </Select>

            <TextInput
              label="Poora address"
              required
              value={form.addressLine}
              onChange={(event) => updateForm({ addressLine: event.target.value })}
              placeholder="House 12, Street 4, G-10/2, Islamabad"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="House / building"
                value={form.houseOrBuilding}
                onChange={(event) => updateForm({ houseOrBuilding: event.target.value })}
                placeholder="House 12, 2nd floor"
              />
              <TextInput
                label="Landmark"
                value={form.landmark}
                onChange={(event) => updateForm({ landmark: event.target.value })}
                placeholder="Masjid ke saamne"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Is address ka naam"
                value={form.label}
                onChange={(event) => updateForm({ label: event.target.value })}
                placeholder="Home / Office"
              />
              <TextInput
                label="Rabta number"
                type="tel"
                inputMode="tel"
                value={form.contactPhone}
                onChange={(event) => updateForm({ contactPhone: event.target.value })}
                placeholder="0300 1234567"
                hint="Technician isi par rabta karega."
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-300 px-3.5 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 4 5.5 10.5 5.5 10.5s5.5-6.5 5.5-10.5A5.5 5.5 0 0 0 10 2Zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
                    clipRule="evenodd"
                  />
                </svg>
                {locating ? 'Dhoond rahe hain...' : 'Meri location istemal karein'}
              </button>
              {form.latitude !== null ? (
                <Badge tone="success">GPS location save ho gayi</Badge>
              ) : (
                <span className="text-xs text-ink-500">Optional — address kaafi hai</span>
              )}
            </div>

            {isSignedIn ? (
              <label className="flex items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={form.saveForLater}
                  onChange={(event) => updateForm({ saveForLater: event.target.checked })}
                  className="h-[1.125rem] w-[1.125rem] rounded border-ink-300 text-brand-700 focus:ring-brand-600"
                />
                Yeh address aage ke liye save kar lein
              </label>
            ) : null}
          </div>
        )}

        <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
          🔒 Technician ko job qubool karne se pehle sirf aapka area dikhta hai. Poora address aur
          phone number tab share hota hai jab woh job accept kar le.
        </p>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={!canProceed} />
    </StepShell>
  );
}
