'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatPaisa } from '@/lib/money';
import { formatDate } from '@/lib/utils';

export interface PlanView {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  description: string;
  pricePaisa: number;
  periodDays: number;
  benefits: string[];
}

export interface MembershipView {
  id: string;
  reference: string;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  pricePaisa: number;
  startsAt: string | null;
  endsAt: string | null;
  planName: string;
  benefits: string[];
  savedPaisa: number;
  bookingsUsed: number;
}

const STATUS_TONE = {
  PENDING_PAYMENT: 'warn',
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
} as const;

const STATUS_LABEL = {
  PENDING_PAYMENT: 'Waiting for payment',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
} as const;

/**
 * A customer's membership, and the plans they can buy.
 *
 * The purchase button says what it does: it records an intent. Nothing here
 * claims to take a payment, because no gateway is configured — the operations
 * team confirms the money and only then does the membership start.
 */
export function MembershipPanel({
  membership,
  plans,
  paymentMethods,
  preselectedPlanCode,
}: {
  membership: MembershipView | null;
  plans: PlanView[];
  paymentMethods: Array<{ value: string; label: string }>;
  preselectedPlanCode?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [buying, setBuying] = useState<PlanView | null>(
    plans.find((plan) => plan.code === preselectedPlanCode) ?? null,
  );
  const [cancelling, setCancelling] = useState(false);

  const live = membership && membership.status !== 'EXPIRED' && membership.status !== 'CANCELLED';

  return (
    <div className="space-y-8">
      {membership ? (
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-ink-900">{membership.planName}</h2>
              <p className="mt-0.5 text-xs text-ink-500">{membership.reference}</p>
            </div>
            <Badge tone={STATUS_TONE[membership.status]}>{STATUS_LABEL[membership.status]}</Badge>
          </div>

          {membership.status === 'PENDING_PAYMENT' ? (
            <p className="mt-3 rounded-xl bg-warn-50 px-3.5 py-2.5 text-sm leading-relaxed text-warn-700">
              Nothing has been charged. Pay {formatPaisa(membership.pricePaisa)} to the support team
              and they will activate this membership — you will get a notification the moment it
              starts. Until then no benefit applies to your bookings.
            </p>
          ) : null}

          {membership.status === 'ACTIVE' ? (
            <>
              <dl className="mt-4 grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-3">
                <Stat
                  label="Runs until"
                  value={membership.endsAt ? formatDate(membership.endsAt) : '—'}
                />
                <Stat label="Saved so far" value={formatPaisa(membership.savedPaisa)} />
                <Stat label="Bookings used on" value={String(membership.bookingsUsed)} />
              </dl>
              {membership.benefits.length > 0 ? (
                <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm text-ink-700">
                  {membership.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-2.5">
                      <span aria-hidden="true" className="text-brand-600">
                        ✓
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Benefits apply on their own — there is nothing to enter at booking time. The
                discount is worked out when the job is completed and shown on the receipt.
              </p>
            </>
          ) : null}

          {live ? (
            <div className="mt-5 border-t border-ink-100 pt-4">
              <Button variant="outline" size="sm" onClick={() => setCancelling(true)}>
                Cancel membership
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!live && plans.length > 0 ? (
        <section>
          <h2 className="text-title text-ink-950">
            {membership ? 'Start a new membership' : 'Choose a plan'}
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col rounded-2xl border border-ink-200 bg-surface p-5"
              >
                <h3 className="text-[0.9375rem] font-semibold text-ink-900">{plan.name}</h3>
                {plan.tagline ? (
                  <p className="mt-0.5 text-sm text-ink-600">{plan.tagline}</p>
                ) : null}
                <p className="mt-3 text-2xl font-bold tracking-tight text-ink-950">
                  {formatPaisa(plan.pricePaisa)}
                  <span className="ml-1.5 text-xs font-medium text-ink-500">
                    / {plan.periodDays} days
                  </span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-700">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-2.5">
                      <span aria-hidden="true" className="text-brand-600">
                        ✓
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-5" fullWidth onClick={() => setBuying(plan)}>
                  Choose {plan.name}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {buying ? (
        <PurchaseDialog
          plan={buying}
          paymentMethods={paymentMethods}
          onClose={() => setBuying(null)}
          onDone={() => {
            setBuying(null);
            router.refresh();
          }}
        />
      ) : null}

      {cancelling && membership ? (
        <CancelDialog
          membership={membership}
          onClose={() => setCancelling(false)}
          onDone={() => {
            setCancelling(false);
            toast({ tone: 'info', title: 'Membership cancelled' });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function PurchaseDialog({
  plan,
  paymentMethods,
  onClose,
  onDone,
}: {
  plan: PlanView;
  paymentMethods: Array<{ value: string; label: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod] = useState(paymentMethods[0]?.value ?? 'CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/memberships', { planId: plan.id, method });
      toast({
        tone: 'success',
        title: 'Membership requested',
        description: 'Our team will confirm the payment and activate it.',
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
      title={`Join ${plan.name}`}
      description={`${formatPaisa(plan.pricePaisa)} for ${plan.periodDays} days.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            Request membership
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

        {paymentMethods.length > 0 ? (
          <Select
            label="How you will pay"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            {paymentMethods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : (
          <p className="rounded-xl bg-warn-50 px-3.5 py-2.5 text-sm text-warn-700">
            No payment method is enabled right now. Please contact support.
          </p>
        )}

        {/* The one thing a subscribe button usually lies about. */}
        <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
          This does not charge you now. It records that you want the plan; the support team confirms
          the payment and the membership starts from that moment. Nothing comes off your bookings
          before then.
        </p>
      </div>
    </Dialog>
  );
}

function CancelDialog({
  membership,
  onClose,
  onDone,
}: {
  membership: MembershipView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel this membership?"
      description="Benefits stop straight away. Bookings already completed keep the discount they were given."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={reason.trim().length < 4}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await api.post(`/api/memberships/${membership.id}/cancel`, { reason });
                onDone();
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
              } finally {
                setLoading(false);
              }
            }}
          >
            Cancel membership
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="rounded-xl bg-alert-50 px-3.5 py-2.5 text-sm text-alert-700">
            {error}
          </p>
        ) : null}
        <Textarea
          label="Reason"
          rows={3}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: I am moving out of the city."
          hint="This helps us improve. Cancelling does not refund the period already paid for."
        />
      </div>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
