'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { ProviderCard, type ProviderCardData } from '@/components/marketing/ProviderCard';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { StepFooter, StepShell } from './WizardProgress';
import type { BookingDraft, FlatService } from './types';

interface MatchResult extends ProviderCardData {
  providerId: string;
}

/**
 * Step 6 — choose a technician.
 *
 * Providers come from the server-side matching engine, which applies the hard
 * eligibility filters (verified, offers this service, covers this area, has
 * capacity) before ranking. The customer may also let the platform fan the job
 * out to the top matches instead of picking one — useful when nobody stands out
 * and speed matters more.
 */
export function StepProvider({
  draft,
  patch,
  service,
  prefilledProviderName,
  onNext,
  onBack,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  service: FlatService | null;
  prefilledProviderName: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const [providers, setProviders] = useState<MatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!draft.serviceId) return;
    setError(null);
    setProviders(null);
    try {
      const result = await api.post<MatchResult[]>('/api/providers/match', {
        serviceId: draft.serviceId,
        ...(draft.addressId ? { addressId: draft.addressId } : {}),
        ...(draft.newAddress?.zoneId ? { zoneId: draft.newAddress.zoneId } : {}),
        ...(draft.scheduledFor ? { scheduledFor: draft.scheduledFor } : {}),
        isEmergency: draft.isEmergency,
        limit: 12,
      });
      setProviders(result);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'UNAUTHENTICATED') {
        // Matching needs a session because it resolves the caller's address.
        setError(
          'Technicians dekhne ke liye login zaroori hai. Login karne ke baad aap wapis yahin aa jayenge.',
        );
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Technicians load nahi ho sake.');
      }
      setProviders([]);
    }
  }, [
    draft.serviceId,
    draft.addressId,
    draft.newAddress?.zoneId,
    draft.scheduledFor,
    draft.isEmergency,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StepShell
      title={draft.isEmergency ? 'Available emergency technicians' : 'Technician chunein'}
      description={
        service
          ? `${service.name} ke liye verified providers, behtareen match pehle.`
          : 'Verified providers.'
      }
    >
      <div className="space-y-4">
        {prefilledProviderName && draft.providerId ? (
          <Badge tone="brand">{prefilledProviderName} pehle se chuna gaya hai</Badge>
        ) : null}

        {providers === null ? (
          <SkeletonList count={3} />
        ) : error ? (
          <div className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
            <p className="text-sm text-warn-700">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 text-sm font-semibold text-warn-700 underline"
            >
              Dobara koshish karein
            </button>
          </div>
        ) : providers.length === 0 ? (
          <EmptyState
            title={
              draft.isEmergency
                ? 'Is waqt koi emergency technician available nahi'
                : 'Is service aur area par koi technician nahi mila'
            }
            description="Aap phir bhi request bhej sakte hain — ops team manually technician assign karegi aur aap ko update milega."
          />
        ) : (
          <div className="space-y-3">
            {providers.map((provider, index) => (
              <div key={provider.providerId} className="relative">
                {index === 0 && !draft.isEmergency ? (
                  <span className="absolute -top-2 left-4 z-10 rounded-full bg-brand-700 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
                    Best match
                  </span>
                ) : null}
                <ProviderCard
                  provider={{ ...provider, id: provider.providerId }}
                  className={
                    draft.providerId === provider.providerId
                      ? 'border-brand-600 ring-1 ring-brand-600'
                      : undefined
                  }
                  action={
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          providerId:
                            draft.providerId === provider.providerId ? null : provider.providerId,
                        })
                      }
                      className={
                        draft.providerId === provider.providerId
                          ? 'h-10 w-full rounded-xl bg-brand-700 text-sm font-semibold text-white'
                          : 'h-10 w-full rounded-xl border border-ink-300 text-sm font-semibold text-ink-800 hover:bg-ink-50'
                      }
                    >
                      {draft.providerId === provider.providerId
                        ? '✓ Chuna gaya'
                        : 'Yeh technician chunein'}
                    </button>
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* Letting the platform fan out is a real, supported path, not a fallback. */}
        {providers !== null && providers.length > 0 ? (
          <button
            type="button"
            onClick={() => patch({ providerId: null })}
            className={
              draft.providerId === null
                ? 'w-full rounded-xl border border-brand-600 bg-brand-50/60 p-4 text-left ring-1 ring-brand-600'
                : 'w-full rounded-xl border border-dashed border-ink-300 p-4 text-left hover:bg-ink-50'
            }
          >
            <span className="block text-sm font-semibold text-ink-900">
              Mere liye behtareen chun lein
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">
              Hum top matched technicians ko request bhej denge; jo pehle qubool kare wohi aayega.
              Aksar yeh sab se tez tareeqa hota hai.
            </span>
          </button>
        ) : null}
      </div>

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel="Booking review karein"
        nextDisabled={providers === null}
      />
    </StepShell>
  );
}
