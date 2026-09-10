'use client';

import { useMemo, useState } from 'react';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { Badge } from '@/components/ui/Badge';
import { RadioCard } from '@/components/ui/Field';
import { formatPaisaRange } from '@/lib/money';
import { cn } from '@/lib/utils';
import { StepFooter, StepShell } from './WizardProgress';
import type { BookingDraft, WizardCatalogue } from './types';

/**
 * Step 2 — pick the service.
 *
 * Two panes: category on the left, its services on the right. On a phone the
 * categories become a horizontal chip strip so the services stay in view.
 */
export function StepService({
  draft,
  patch,
  catalogue,
  onNext,
  onBack,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  catalogue: WizardCatalogue;
  onNext: () => void;
  onBack: () => void;
}) {
  const [categorySlug, setCategorySlug] = useState<string>(
    draft.categorySlug ?? catalogue[0]?.slug ?? '',
  );

  const category = useMemo(
    () => catalogue.find((entry) => entry.slug === categorySlug) ?? catalogue[0] ?? null,
    [catalogue, categorySlug],
  );

  return (
    <StepShell
      title="Konsi service?"
      description="Apni category chunein, phir us mein se service."
    >
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        {/* Categories */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Category
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 no-scrollbar lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {catalogue.map((entry) => {
              const active = entry.slug === category?.slug;
              return (
                <button
                  key={entry.slug}
                  type="button"
                  onClick={() => {
                    setCategorySlug(entry.slug);
                    // Changing category invalidates the chosen service.
                    patch({ categorySlug: entry.slug, serviceId: null, providerId: null });
                  }}
                  aria-pressed={active}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors lg:w-full',
                    active
                      ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                      : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  <ServiceIconTile iconKey={entry.iconKey} size="sm" />
                  <span className="whitespace-nowrap text-sm font-medium text-ink-900 lg:whitespace-normal">
                    {entry.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Services in the selected category */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {category?.name} services
          </p>
          <div className="space-y-2">
            {category?.services.map((service) => (
              <RadioCard
                key={service.id}
                checked={draft.serviceId === service.id}
                onSelect={() =>
                  patch({
                    serviceId: service.id,
                    categorySlug: category.slug,
                    // A different service may not be offered by the chosen
                    // provider, so the selection is cleared.
                    providerId: null,
                    isEmergency: draft.isEmergency && service.isEmergencyEnabled,
                  })
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{service.name}</span>
                      {service.isEmergencyEnabled ? (
                        <Badge tone="danger">Emergency</Badge>
                      ) : null}
                    </div>
                    {service.description ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                        {service.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-xs text-ink-500">
                      {service.requiresInspection
                        ? 'Muaina ke baad quote'
                        : `Andazan ${service.estimatedMinutes} min`}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-ink-900">
                      {formatPaisaRange(service.minPricePaisa, service.maxPricePaisa)}
                    </span>
                    <span className="block text-[0.6875rem] text-ink-400">andazan</span>
                  </span>
                </div>
              </RadioCard>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Yeh sirf andaza hain. Final qeemat technician ke muaina aur likhit quote se tay hogi,
            jise aap approve ya reject karenge.
          </p>
        </div>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={!draft.serviceId} />
    </StepShell>
  );
}
