'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { StepIntake } from './StepIntake';
import { StepService } from './StepService';
import { StepDetails } from './StepDetails';
import { StepLocation } from './StepLocation';
import { StepSchedule } from './StepSchedule';
import { StepProvider } from './StepProvider';
import { StepConfirm } from './StepConfirm';
import { StepDone } from './StepDone';
import { WizardProgress } from './WizardProgress';
import type { BookingDraft, WizardCatalogue, WizardConfig, WizardStep, ZoneOption, AddressOption, PaymentMethodOption } from './types';

/**
 * Customer booking wizard.
 *
 * Seven steps, matching the flow in the brief: describe the problem, pick the
 * service, add detail and photos, set the location, choose a time, choose a
 * technician, confirm.
 *
 * State is held here and passed down, rather than in a store: the draft is one
 * flat object, every step is a pure function of it, and nothing is persisted
 * until the final POST. That means a half-finished wizard never leaves a stray
 * booking row behind.
 *
 * The whole flow is designed to be completable in under two minutes, so a
 * signed-in customer with a saved address skips straight past the steps that
 * already have answers.
 */

const STEP_ORDER: WizardStep[] = [
  'intake',
  'service',
  'details',
  'location',
  'schedule',
  'provider',
  'confirm',
];

export function BookingWizard({
  isSignedIn,
  catalogue,
  zones,
  addresses,
  paymentMethods,
  prefill,
  config,
}: {
  isSignedIn: boolean;
  catalogue: WizardCatalogue;
  zones: ZoneOption[];
  addresses: AddressOption[];
  paymentMethods: PaymentMethodOption[];
  prefill: {
    problem: string | null;
    categorySlug: string | null;
    serviceId: string | null;
    providerId: string | null;
    providerName: string | null;
    zoneSlug: string | null;
    isEmergency: boolean;
    via: string | null;
  };
  config: WizardConfig;
}) {
  const [draft, setDraft] = useState<BookingDraft>(() => ({
    problem: prefill.problem ?? '',
    categorySlug: prefill.categorySlug,
    serviceId: prefill.serviceId,
    fileIds: [],
    addressId: addresses.find((address) => address.isDefault)?.id ?? null,
    newAddress: null,
    scheduledFor: null,
    providerId: prefill.providerId,
    isEmergency: prefill.isEmergency,
    urgency: prefill.isEmergency ? 'EMERGENCY' : 'NORMAL',
    paymentMethod: paymentMethods[0]?.method ?? 'CASH',
    intakeSummary: null,
    customerNotes: '',
  }));

  // A deep link that already names a service skips the intake conversation.
  const [step, setStep] = useState<WizardStep>(() => {
    if (prefill.serviceId) return 'details';
    if (prefill.problem) return 'intake';
    if (prefill.categorySlug) return 'service';
    return 'intake';
  });

  const [createdBooking, setCreatedBooking] = useState<{
    id: string;
    reference: string;
    providersNotified: number;
    awaitingManualAssignment: boolean;
  } | null>(null);

  const patch = useCallback((updates: Partial<BookingDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  }, []);

  const allServices = useMemo(
    () =>
      catalogue.flatMap((category) =>
        category.services.map((service) => ({
          ...service,
          categorySlug: category.slug,
          categoryName: category.name,
          categoryIconKey: category.iconKey,
        })),
      ),
    [catalogue],
  );

  const selectedService = useMemo(
    () => allServices.find((service) => service.id === draft.serviceId) ?? null,
    [allServices, draft.serviceId],
  );

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === draft.addressId) ?? null,
    [addresses, draft.addressId],
  );

  const stepIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    setStep((current) => {
      const index = STEP_ORDER.indexOf(current);
      return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)] ?? current;
    });
    // Long steps push the heading off screen on a phone; bring it back.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => {
      const index = STEP_ORDER.indexOf(current);
      return STEP_ORDER[Math.max(index - 1, 0)] ?? current;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (createdBooking) {
    return (
      <StepDone
        booking={createdBooking}
        serviceName={selectedService?.name ?? 'Service'}
        isEmergency={draft.isEmergency}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-display-sm text-ink-950">
          {draft.isEmergency ? 'Emergency booking' : 'Service book karein'}
        </h1>
        <p className="mt-1.5 text-sm text-ink-600">
          {draft.isEmergency
            ? 'Emergency technicians dhoond rahe hain. Charges confirm karne se pehle dikhaye jayenge.'
            : 'Chand sawal, phir aap ka technician tayyar.'}
        </p>
        {prefill.via ? (
          <p className="mt-1 text-xs text-ink-500">
            {prefill.via === 'whatsapp'
              ? 'WhatsApp se aayi maloomat pehle se bhar di gayi hai.'
              : prefill.via === 'voice'
                ? 'Call se aayi maloomat pehle se bhar di gayi hai.'
                : null}
          </p>
        ) : null}
      </div>

      <WizardProgress steps={STEP_ORDER} current={step} onSelect={(target) => {
        // Only allow jumping back to a step already passed.
        if (STEP_ORDER.indexOf(target) < stepIndex) setStep(target);
      }} />

      <div className="mt-6">
        {step === 'intake' ? (
          <StepIntake
            draft={draft}
            patch={patch}
            catalogue={catalogue}
            aiConfigured={config.aiConfigured}
            onNext={goNext}
            onSkip={() => setStep('service')}
          />
        ) : null}

        {step === 'service' ? (
          <StepService
            draft={draft}
            patch={patch}
            catalogue={catalogue}
            onNext={goNext}
            onBack={goBack}
          />
        ) : null}

        {step === 'details' ? (
          <StepDetails
            draft={draft}
            patch={patch}
            service={selectedService}
            isSignedIn={isSignedIn}
            onNext={goNext}
            onBack={goBack}
          />
        ) : null}

        {step === 'location' ? (
          <StepLocation
            draft={draft}
            patch={patch}
            zones={zones}
            addresses={addresses}
            isSignedIn={isSignedIn}
            mapsConfigured={config.mapsConfigured}
            onNext={goNext}
            onBack={goBack}
          />
        ) : null}

        {step === 'schedule' ? (
          <StepSchedule
            draft={draft}
            patch={patch}
            service={selectedService}
            config={config}
            onNext={goNext}
            onBack={goBack}
          />
        ) : null}

        {step === 'provider' ? (
          <StepProvider
            draft={draft}
            patch={patch}
            service={selectedService}
            prefilledProviderName={prefill.providerName}
            onNext={goNext}
            onBack={goBack}
          />
        ) : null}

        {step === 'confirm' ? (
          <StepConfirm
            draft={draft}
            patch={patch}
            service={selectedService}
            address={selectedAddress}
            zones={zones}
            paymentMethods={paymentMethods}
            config={config}
            isSignedIn={isSignedIn}
            onBack={goBack}
            onCreated={setCreatedBooking}
          />
        ) : null}
      </div>

      {!isSignedIn ? (
        <div className="mt-8 rounded-xl border border-info-100 bg-info-50 px-4 py-3">
          <p className="text-sm text-info-700">
            Booking confirm karne ke liye login zaroori hai — aap yahan tak ki maloomat bhar sakte
            hain, phir aakhir mein login karein.{' '}
            <Link href="/login?next=/book" className="font-semibold underline">
              Ab login karein
            </Link>
          </p>
        </div>
      ) : null}

      <p className="mt-8 text-center text-xs text-ink-500">
        Madad chahiye?{' '}
        <ButtonLink href="/contact" variant="ghost" size="sm" className="h-auto px-1 py-0 text-xs">
          Support se rabta karein
        </ButtonLink>
      </p>
    </div>
  );
}
