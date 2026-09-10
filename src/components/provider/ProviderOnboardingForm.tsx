'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox, Textarea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { formatPaisa } from '@/lib/money';
import { DAY_NAMES, minutesToTimeLabel, cn } from '@/lib/utils';

interface ProfileData {
  businessName: string;
  contactPhone: string;
  headline: string | null;
  description: string | null;
  yearsExperience: number;
  addressLine: string | null;
  sector: string | null;
  status: string;
  emergencyAvailable: boolean;
  emergencyFeePaisa: number;
  serviceRadiusKm: number;
  photoUrl: string | null;
  bankAccountTitle: string | null;
  bankName: string | null;
  bankIbanMasked: string | null;
  services: Array<{ serviceId: string; startingPricePaisa: number }>;
  zoneIds: string[];
  availability: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  verifications: Array<{ kind: string; status: string; reference: string | null }>;
  documents: Array<{ id: string; name: string }>;
}

interface CategoryOption {
  slug: string;
  name: string;
  iconKey: string;
  services: Array<{ id: string; name: string; minPricePaisa: number }>;
}

const HOUR_OPTIONS = Array.from({ length: 25 }).map((_, hour) => hour * 60);

/**
 * Provider onboarding and profile editing.
 *
 * The same form serves both: a provider can revise their submission while
 * pending, and keep their services, rates and hours current after verification.
 * Nothing here can change verification status — that is an admin decision, and
 * the form says so rather than implying self-service approval.
 */
export function ProviderOnboardingForm({
  profile,
  catalogue,
  zones,
  limits,
}: {
  profile: ProfileData | null;
  catalogue: CategoryOption[];
  zones: Array<{ id: string; name: string }>;
  limits: { maxEmergencyFeePaisa: number; requireCnic: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState({
    businessName: profile?.businessName ?? '',
    contactPhone: profile?.contactPhone ?? '',
    headline: profile?.headline ?? '',
    description: profile?.description ?? '',
    yearsExperience: String(profile?.yearsExperience ?? 0),
    addressLine: profile?.addressLine ?? '',
    sector: profile?.sector ?? '',
    emergencyAvailable: profile?.emergencyAvailable ?? false,
    emergencyFeeRupees: profile ? String(profile.emergencyFeePaisa / 100) : '',
    serviceRadiusKm: String(profile?.serviceRadiusKm ?? 15),
    cnicReference:
      profile?.verifications.find((v) => v.kind === 'IDENTITY_CNIC')?.reference ?? '',
    bankAccountTitle: profile?.bankAccountTitle ?? '',
    bankName: profile?.bankName ?? '',
    bankIban: '',
    acceptedTerms: profile !== null,
  });

  // Service id -> starting price in rupees, as typed.
  const [services, setServices] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const entry of profile?.services ?? []) {
      map[entry.serviceId] = String(entry.startingPricePaisa / 100);
    }
    return map;
  });

  const [zoneIds, setZoneIds] = useState<string[]>(profile?.zoneIds ?? []);

  const [availability, setAvailability] = useState<
    Record<number, { enabled: boolean; startMinute: number; endMinute: number }>
  >(() => {
    const base: Record<number, { enabled: boolean; startMinute: number; endMinute: number }> = {};
    for (let day = 0; day < 7; day += 1) {
      const existing = profile?.availability.find((window) => window.dayOfWeek === day);
      base[day] = existing
        ? { enabled: true, startMinute: existing.startMinute, endMinute: existing.endMinute }
        : { enabled: day >= 1 && day <= 6, startMinute: 9 * 60, endMinute: 19 * 60 };
    }
    return base;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl ?? null);
  const [documents, setDocuments] = useState(profile?.documents ?? []);

  const selectedServiceIds = Object.keys(services).filter((id) => services[id] !== undefined);

  function toggleService(serviceId: string, minPricePaisa: number) {
    setServices((current) => {
      if (serviceId in current) {
        const next = { ...current };
        delete next[serviceId];
        return next;
      }
      // Seed with the catalogue's indicative floor so the field is never blank.
      return { ...current, [serviceId]: String(minPricePaisa / 100) };
    });
  }

  async function uploadPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!profile) {
      toast({
        tone: 'error',
        title: 'Pehle profile save karein',
        description: 'Photo upload karne ke liye profile mojood hona zaroori hai.',
      });
      return;
    }
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'PROVIDER_PROFILE_PHOTO');
    try {
      const result = await api.upload<{ url: string }>('/api/files', formData);
      setPhotoUrl(result.url);
      toast({ tone: 'success', title: 'Photo update ho gayi' });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Photo upload nahi hui',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function uploadDocument(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!profile) {
      toast({ tone: 'error', title: 'Pehle profile save karein' });
      return;
    }
    setUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'PROVIDER_DOCUMENT');
    try {
      const result = await api.upload<{ id: string; originalName: string }>('/api/files', formData);
      setDocuments((current) => [...current, { id: result.id, name: result.originalName }]);
      toast({
        tone: 'success',
        title: 'Document upload ho gaya',
        description: 'Sirf aap aur ops team isay dekh sakte hain.',
      });
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Document upload nahi hua',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setUploadingDoc(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrors({});

    const payload = {
      businessName: form.businessName,
      contactPhone: form.contactPhone,
      headline: form.headline || undefined,
      description: form.description || undefined,
      yearsExperience: Number(form.yearsExperience) || 0,
      addressLine: form.addressLine || undefined,
      sector: form.sector || undefined,
      services: selectedServiceIds.map((serviceId) => ({
        serviceId,
        startingPriceRupees: Number(services[serviceId]) || 0,
      })),
      zoneIds,
      availability: Object.entries(availability)
        .filter(([, window]) => window.enabled)
        .map(([day, window]) => ({
          dayOfWeek: Number(day),
          startMinute: window.startMinute,
          endMinute: window.endMinute,
        })),
      emergencyAvailable: form.emergencyAvailable,
      emergencyFeeRupees: form.emergencyAvailable
        ? Number(form.emergencyFeeRupees) || 0
        : undefined,
      serviceRadiusKm: Number(form.serviceRadiusKm) || 15,
      cnicReference: form.cnicReference || undefined,
      bankAccountTitle: form.bankAccountTitle || undefined,
      bankName: form.bankName || undefined,
      bankIban: form.bankIban || undefined,
      acceptedTerms: true as const,
    };

    try {
      const result = await api.put<{ status: string; message: string }>(
        '/api/provider/onboarding',
        payload,
      );
      toast({ tone: 'success', title: result.message });
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

  const canSubmit =
    form.businessName.trim().length >= 3 &&
    form.contactPhone.trim().length >= 10 &&
    selectedServiceIds.length > 0 &&
    zoneIds.length > 0 &&
    form.acceptedTerms;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {/* ------------------------------------------------------------- basics */}
      <Section title="Aap ke baare mein">
        <div className="space-y-4">
          <TextInput
            label="Business ya apna naam"
            required
            value={form.businessName}
            onChange={(event) => setForm((f) => ({ ...f, businessName: event.target.value }))}
            placeholder="Misal: Ali Electric Services"
            error={errors.businessName}
            hint="Yeh naam customers ko dikhta hai."
          />
          <TextInput
            label="Rabta number"
            required
            type="tel"
            inputMode="tel"
            value={form.contactPhone}
            onChange={(event) => setForm((f) => ({ ...f, contactPhone: event.target.value }))}
            placeholder="0300 1234567"
            error={errors.contactPhone}
            hint="Customer ko sirf booking qubool karne ke baad dikhta hai."
          />
          <TextInput
            label="Ek line mein apna kaam"
            value={form.headline}
            onChange={(event) => setForm((f) => ({ ...f, headline: event.target.value }))}
            placeholder="AC aur electrical ka 12 saal ka tajurba"
            error={errors.headline}
          />
          <Textarea
            label="Tafseel"
            rows={4}
            value={form.description}
            onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            placeholder="Aap kya kaam karte hain, kaunse brands, kya guarantee dete hain..."
            error={errors.description}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Tajurba (saal)"
              type="number"
              min={0}
              max={60}
              value={form.yearsExperience}
              onChange={(event) => setForm((f) => ({ ...f, yearsExperience: event.target.value }))}
              error={errors.yearsExperience}
            />
            <TextInput
              label="Service radius (km)"
              type="number"
              min={1}
              max={100}
              value={form.serviceRadiusKm}
              onChange={(event) => setForm((f) => ({ ...f, serviceRadiusKm: event.target.value }))}
              error={errors.serviceRadiusKm}
              hint="Is se zyada door ki jobs nahi aayengi."
            />
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------------- photo */}
      <Section
        title="Profile photo"
        description="Asli tasveer trust barhati hai. Yeh public hoti hai."
      >
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-xs text-ink-500">
              Photo
            </span>
          )}
          <div className="min-w-0 flex-1">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => uploadPhoto(event.target.files)}
              disabled={uploadingPhoto || !profile}
              className="block w-full text-sm text-ink-600 file:mr-3 file:h-10 file:cursor-pointer file:rounded-xl file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 disabled:opacity-50"
            />
            {!profile ? (
              <p className="mt-1.5 text-xs text-ink-500">
                Pehle profile save karein, phir photo upload kar sakenge.
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------------------- services */}
      <Section
        title="Aap kaunsi services karte hain?"
        description="Service select karein aur apna starting rate likhein. Final qeemat aap ke quote se tay hoti hai."
      >
        {errors.services ? (
          <p role="alert" className="mb-3 text-sm text-alert-600">
            {errors.services}
          </p>
        ) : null}
        <div className="space-y-5">
          {catalogue.map((category) => (
            <div key={category.slug}>
              <div className="flex items-center gap-2.5">
                <ServiceIconTile iconKey={category.iconKey} size="sm" />
                <h3 className="text-sm font-semibold text-ink-900">{category.name}</h3>
              </div>
              <ul className="mt-2.5 space-y-2">
                {category.services.map((service) => {
                  const selected = service.id in services;
                  return (
                    <li
                      key={service.id}
                      className={cn(
                        'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
                        selected ? 'border-brand-300 bg-brand-50/40' : 'border-ink-200',
                      )}
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleService(service.id, service.minPricePaisa)}
                          className="h-[1.125rem] w-[1.125rem] shrink-0 rounded border-ink-300 text-brand-700 focus:ring-brand-600"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink-900">
                            {service.name}
                          </span>
                          <span className="block text-xs text-ink-500">
                            Market {formatPaisa(service.minPricePaisa)} se
                          </span>
                        </span>
                      </label>

                      {selected ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-ink-500">Rs.</span>
                          <input
                            type="number"
                            min={0}
                            value={services[service.id] ?? ''}
                            onChange={(event) =>
                              setServices((current) => ({
                                ...current,
                                [service.id]: event.target.value,
                              }))
                            }
                            aria-label={`${service.name} starting rate`}
                            className="h-9 w-24 rounded-lg border border-ink-300 px-2.5 text-sm text-ink-900 focus:border-brand-600"
                          />
                          <span className="text-xs text-ink-500">se</span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------------- areas */}
      <Section
        title="Aap kahan kaam karte hain?"
        description="Sirf inhi areas ki jobs aap ko offer hongi."
      >
        {errors.zoneIds ? (
          <p role="alert" className="mb-3 text-sm text-alert-600">
            {errors.zoneIds}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {zones.map((zone) => {
            const selected = zoneIds.includes(zone.id);
            return (
              <button
                key={zone.id}
                type="button"
                onClick={() =>
                  setZoneIds((current) =>
                    current.includes(zone.id)
                      ? current.filter((id) => id !== zone.id)
                      : [...current, zone.id],
                  )
                }
                aria-pressed={selected}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
                )}
              >
                {zone.name}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-500">{zoneIds.length} area chune gaye</p>
      </Section>

      {/* ------------------------------------------------------------- hours */}
      <Section title="Working hours" description="Matching mein aap ke waqt ka khayal rakha jata hai.">
        <ul className="space-y-2">
          {DAY_NAMES.map((dayName, day) => {
            const window = availability[day]!;
            return (
              <li key={day} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3">
                <label className="flex w-32 shrink-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={window.enabled}
                    onChange={(event) =>
                      setAvailability((current) => ({
                        ...current,
                        [day]: { ...window, enabled: event.target.checked },
                      }))
                    }
                    className="h-[1.125rem] w-[1.125rem] rounded border-ink-300 text-brand-700 focus:ring-brand-600"
                  />
                  <span className="text-sm text-ink-900">{dayName}</span>
                </label>

                {window.enabled ? (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`${dayName} start`}
                      value={window.startMinute}
                      onChange={(event) =>
                        setAvailability((current) => ({
                          ...current,
                          [day]: { ...window, startMinute: Number(event.target.value) },
                        }))
                      }
                      className="h-9 rounded-lg border border-ink-300 px-2 text-sm"
                    >
                      {HOUR_OPTIONS.slice(0, 24).map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutesToTimeLabel(minutes)}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-ink-500">se</span>
                    <select
                      aria-label={`${dayName} end`}
                      value={window.endMinute}
                      onChange={(event) =>
                        setAvailability((current) => ({
                          ...current,
                          [day]: { ...window, endMinute: Number(event.target.value) },
                        }))
                      }
                      className="h-9 rounded-lg border border-ink-300 px-2 text-sm"
                    >
                      {HOUR_OPTIONS.filter((minutes) => minutes > window.startMinute).map(
                        (minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes === 1440 ? '12:00 AM' : minutesToTimeLabel(minutes)}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                ) : (
                  <span className="text-sm text-ink-400">Chhutti</span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ---------------------------------------------------------- emergency */}
      <Section
        title="Emergency service"
        description="Emergency jobs raat ya chhutti mein bhi aa sakti hain."
      >
        <div className="space-y-4">
          <Checkbox
            label="Main emergency calls leta hoon"
            checked={form.emergencyAvailable}
            onChange={(event) =>
              setForm((f) => ({ ...f, emergencyAvailable: event.target.checked }))
            }
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
              hint={`Platform ki maximum limit ${formatPaisa(limits.maxEmergencyFeePaisa)} hai. Yeh fee customer ko booking se pehle dikhayi jati hai.`}
            />
          ) : null}
        </div>
      </Section>

      {/* ------------------------------------------------------ verification */}
      <Section
        title="Verification"
        description="In maloomat ka jaiza ops team karti hai. Verification status aap khud tabdeel nahi kar sakte."
      >
        <div className="space-y-4">
          <TextInput
            label="CNIC ke aakhri 4 hindse"
            value={form.cnicReference}
            onChange={(event) => setForm((f) => ({ ...f, cnicReference: event.target.value }))}
            placeholder="1234"
            maxLength={6}
            error={errors.cnicReference}
            hint="Poora CNIC number na likhein — hum poora number store nahi karte."
            required={limits.requireCnic}
          />

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-800">
              Shanakhti document{limits.requireCnic ? ' (zaroori)' : ' (optional)'}
            </p>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => uploadDocument(event.target.files)}
              disabled={uploadingDoc || !profile}
              className="block w-full text-sm text-ink-600 file:mr-3 file:h-10 file:cursor-pointer file:rounded-xl file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 disabled:opacity-50"
            />
            <p className="mt-1.5 text-xs text-ink-500">
              🔒 Yeh document sirf aap aur ops team dekh sakti hai. Customers kabhi nahi.
            </p>
            {documents.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {documents.map((document) => (
                  <li key={document.id} className="text-sm text-ink-700">
                    ✓ {document.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {profile ? (
            <div className="rounded-xl bg-ink-50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Mojooda status
              </p>
              <ul className="mt-2 space-y-1.5">
                {profile.verifications.map((verification) => (
                  <li
                    key={verification.kind}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-ink-700">{verificationLabel(verification.kind)}</span>
                    <Badge
                      tone={
                        verification.status === 'APPROVED'
                          ? 'success'
                          : verification.status === 'REJECTED'
                            ? 'danger'
                            : verification.status === 'SUBMITTED'
                              ? 'warn'
                              : 'neutral'
                      }
                    >
                      {verification.status === 'APPROVED'
                        ? 'Verified'
                        : verification.status === 'SUBMITTED'
                          ? 'Review mein'
                          : verification.status === 'REJECTED'
                            ? 'Manzoor nahi'
                            : 'Baqi hai'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      {/* -------------------------------------------------------------- payout */}
      <Section
        title="Payout account"
        description="Payout record ke liye. Hum poora IBAN store nahi karte — sirf aakhri 4 hindse aur ek hash."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Account title"
              value={form.bankAccountTitle}
              onChange={(event) => setForm((f) => ({ ...f, bankAccountTitle: event.target.value }))}
              error={errors.bankAccountTitle}
            />
            <TextInput
              label="Bank ka naam"
              value={form.bankName}
              onChange={(event) => setForm((f) => ({ ...f, bankName: event.target.value }))}
              error={errors.bankName}
            />
          </div>
          <TextInput
            label="IBAN"
            value={form.bankIban}
            onChange={(event) => setForm((f) => ({ ...f, bankIban: event.target.value }))}
            placeholder="PK00XXXX0000000000000000"
            error={errors.bankIban}
            hint={
              profile?.bankIbanMasked
                ? `Mojooda: ${profile.bankIbanMasked}. Badalne ke liye naya IBAN likhein.`
                : 'PK se shuru hone wala valid IBAN.'
            }
          />
        </div>
      </Section>

      {!profile ? (
        <Checkbox
          checked={form.acceptedTerms}
          onChange={(event) => setForm((f) => ({ ...f, acceptedTerms: event.target.checked }))}
          error={errors.acceptedTerms}
          label="Main provider terms se ittefaq karta/karti hoon aur tasdeeq karta/karti hoon ke di gayi maloomat durust hai."
        />
      ) : null}

      <div className="sticky bottom-16 z-10 rounded-2xl border border-ink-200 bg-white/95 p-4 backdrop-blur md:bottom-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            {selectedServiceIds.length} service · {zoneIds.length} area
            {profile ? ` · Status: ${profile.status}` : ''}
          </p>
          <Button type="submit" loading={loading} disabled={!canSubmit}>
            {profile ? 'Profile update karein' : 'Profile submit karein'}
          </Button>
        </div>
        {!canSubmit ? (
          <p className="mt-2 text-xs text-ink-500">
            Naam, phone, kam az kam ek service aur ek area zaroori hain.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="text-[0.9375rem] font-semibold text-ink-900">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function verificationLabel(kind: string): string {
  const labels: Record<string, string> = {
    IDENTITY_CNIC: 'Shanakht (CNIC)',
    PHONE: 'Phone',
    EMAIL: 'Email',
    PLATFORM_ONBOARDING: 'Platform review',
    BANK_ACCOUNT: 'Payout account',
  };
  return labels[kind] ?? kind;
}
