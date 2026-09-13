'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client/api';
import { Badge } from '@/components/ui/Badge';
import { RadioCard } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatPaisa, formatPaisaRange } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';
import { StepFooter, StepShell } from './WizardProgress';
import type {
  AddressOption,
  BookingDraft,
  FlatService,
  PaymentMethodOption,
  WizardConfig,
  ZoneOption,
} from './types';

interface CreatedBooking {
  id: string;
  reference: string;
  status: string;
  providerId: string | null;
}

/**
 * Step 7 — review and confirm.
 *
 * This is where the booking is actually created. If the customer entered a new
 * address it is saved first, then the booking POST runs — two calls, in order,
 * because the booking needs an address id it can validate ownership of.
 *
 * No price is committed here beyond the disclosed emergency fee: the service
 * price comes from the technician's quote, and the summary says so plainly.
 */
export function StepConfirm({
  draft,
  patch,
  service,
  address,
  zones,
  paymentMethods,
  config,
  isSignedIn,
  onBack,
  onCreated,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  service: FlatService | null;
  address: AddressOption | null;
  zones: ZoneOption[];
  paymentMethods: PaymentMethodOption[];
  config: WizardConfig;
  isSignedIn: boolean;
  onBack: () => void;
  onCreated: (booking: {
    id: string;
    reference: string;
    providersNotified: number;
    awaitingManualAssignment: boolean;
  }) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zoneName =
    address?.zoneName ?? zones.find((zone) => zone.id === draft.newAddress?.zoneId)?.name ?? null;

  const guaranteeApplies = service?.guaranteeEligible ?? false;

  async function submit() {
    setError(null);
    setSubmitting(true);

    try {
      // A new address is persisted first so the booking can reference it.
      let addressId = draft.addressId;
      if (!addressId && draft.newAddress) {
        const created = await api.post<{ id: string }>('/api/addresses', {
          label: draft.newAddress.label || 'Home',
          zoneId: draft.newAddress.zoneId,
          addressLine: draft.newAddress.addressLine,
          houseOrBuilding: draft.newAddress.houseOrBuilding || undefined,
          landmark: draft.newAddress.landmark || undefined,
          contactPhone: draft.newAddress.contactPhone || undefined,
          latitude: draft.newAddress.latitude,
          longitude: draft.newAddress.longitude,
          isDefault: draft.newAddress.saveForLater,
        });
        addressId = created.id;
        patch({ addressId });
      }

      if (!addressId || !draft.serviceId) {
        setError('Both a service and an address are required.');
        setSubmitting(false);
        return;
      }

      const result = await api.withMeta<CreatedBooking>('/api/bookings', {
        method: 'POST',
        body: {
          serviceId: draft.serviceId,
          addressId,
          problemDescription: draft.problem,
          providerId: draft.providerId,
          scheduledFor: draft.scheduledFor,
          urgency: draft.urgency,
          isEmergency: draft.isEmergency,
          customerNotes: draft.customerNotes || undefined,
          fileIds: draft.fileIds.length > 0 ? draft.fileIds : undefined,
          intakeSummary: draft.intakeSummary ?? undefined,
        },
      });

      const meta = result.meta as
        { providersNotified?: number; awaitingManualAssignment?: boolean } | undefined;

      toast({ tone: 'success', title: `Booking confirm — ${result.data.reference}` });
      onCreated({
        id: result.data.id,
        reference: result.data.reference,
        providersNotified: meta?.providersNotified ?? 0,
        awaitingManualAssignment: meta?.awaitingManualAssignment ?? false,
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.code === 'UNAUTHENTICATED') {
          setError('You need to sign in to confirm a booking.');
        }
      } else {
        setError('The booking could not be created. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <StepShell title="Review booking" description="Does everything look right? Then confirm.">
      <div className="space-y-5">
        <dl className="divide-y divide-ink-200 rounded-xl border border-ink-200">
          <Row label="Service">
            <span className="font-medium text-ink-900">{service?.name ?? '—'}</span>
            {service ? (
              <span className="block text-xs text-ink-500">{service.categoryName}</span>
            ) : null}
          </Row>

          <Row label="Problem">
            <span className="whitespace-pre-line text-ink-800">{draft.problem}</span>
            {draft.customerNotes ? (
              <span className="mt-1 block text-xs text-ink-500">
                Hidayat: {draft.customerNotes}
              </span>
            ) : null}
          </Row>

          <Row label="Location">
            {address ? (
              <>
                <span className="text-ink-800">{address.addressLine}</span>
                <span className="block text-xs text-ink-500">
                  {address.zoneName ?? address.city}
                </span>
              </>
            ) : draft.newAddress ? (
              <>
                <span className="text-ink-800">{draft.newAddress.addressLine}</span>
                <span className="block text-xs text-ink-500">
                  {zoneName ?? 'Islamabad'}
                  {draft.newAddress.latitude !== null ? ' · GPS location saved' : ''}
                </span>
              </>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </Row>

          <Row label="Time">
            {draft.isEmergency ? (
              <Badge tone="danger">🚨 Emergency — right now</Badge>
            ) : draft.scheduledFor ? (
              <span className="text-ink-800">{formatDateTime(draft.scheduledFor)}</span>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </Row>

          <Row label="Technician">
            {draft.providerId ? (
              <span className="text-ink-800">You chose this one</span>
            ) : (
              <>
                <span className="text-ink-800">We will pick the best match</span>
                <span className="block text-xs text-ink-500">
                  The request goes to the best-matched technicians; whoever accepts first is the one
                  who comes.
                </span>
              </>
            )}
          </Row>

          {draft.fileIds.length > 0 ? (
            <Row label="Attachments">
              <span className="text-ink-800">{draft.fileIds.length} file(s)</span>
            </Row>
          ) : null}
        </dl>

        {/* Payment method */}
        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">Payment method</p>
          {paymentMethods.length > 0 ? (
            <div className="space-y-2">
              {paymentMethods.map((method) => (
                <RadioCard
                  key={method.method}
                  checked={draft.paymentMethod === method.method}
                  onSelect={() => patch({ paymentMethod: method.method })}
                >
                  <span className="block text-sm font-semibold text-ink-900">{method.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-600">{method.description}</span>
                </RadioCard>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-700">
              No payment method is enabled right now. Please contact support.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-500">
            Payment happens when the work is complete, not now.
          </p>
        </div>

        {/* Price expectation */}
        <div className="rounded-xl border border-ink-200 bg-surface-sunken p-4">
          <p className="text-sm font-semibold text-ink-900">Estimated price</p>
          <dl className="mt-2.5 space-y-1.5 text-sm">
            {service ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-600">{service.name} (indicative)</dt>
                <dd className="text-ink-800">
                  {formatPaisaRange(service.minPricePaisa, service.maxPricePaisa)}
                </dd>
              </div>
            ) : null}
            {draft.isEmergency ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-600">Emergency fee</dt>
                <dd className="text-ink-800">
                  From {formatPaisa(config.defaultEmergencyFeePaisa)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 border-t border-ink-200 pt-2.5 text-xs leading-relaxed text-ink-600">
            Nothing is charged now. The technician inspects it and sends a written quote —
            inspection, labour and parts listed separately. Work starts once you approve, and no
            extra charge applies without your permission.
          </p>
        </div>

        {guaranteeApplies && config.guaranteeDays > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <span aria-hidden="true">🛡️</span>
            <p className="text-xs leading-relaxed text-brand-900">
              <strong className="font-semibold">
                The {config.guaranteeDays}-day Fix Guarantee applies.
              </strong>{' '}
              If the same problem returns within this period you can request a re-visit. Every claim
              is reviewed by the ops team.
            </p>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
            <p className="text-sm font-medium text-alert-700">{error}</p>
            {!isSignedIn ? (
              <Link
                href="/login?next=/book"
                className="mt-1.5 inline-block text-sm font-semibold text-alert-700 underline"
              >
                Sign in
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <StepFooter
        onBack={onBack}
        onNext={submit}
        loading={submitting}
        nextLabel={draft.isEmergency ? 'Send emergency request' : 'Confirm booking'}
        nextDisabled={!service || paymentMethods.length === 0}
      />
    </StepShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
      <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  );
}
