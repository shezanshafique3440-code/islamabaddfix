'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Checkbox, TextInput, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisa, paisaToRupees } from '@/lib/money';
import { formatDate, formatRelative } from '@/lib/utils';

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  description: string;
  pricePaisa: number;
  periodDays: number;
  discountBp: number;
  maxDiscountPaisa: number | null;
  guaranteeBonusDays: number;
  priorityFanoutBonus: number;
  emergencyFeeWaiverPaisa: number;
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
}

export interface MembershipRow {
  id: string;
  reference: string;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  planName: string;
  customerName: string;
  customerEmail: string;
  pricePaisa: number;
  createdAt: string;
  endsAt: string | null;
  paymentMethod: string | null;
}

const STATUS_TONE = {
  PENDING_PAYMENT: 'warn',
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
} as const;

const STATUS_LABEL = {
  PENDING_PAYMENT: 'Awaiting payment',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
} as const;

export function MembershipManager({
  plans,
  memberships,
  limits,
}: {
  plans: PlanRow[];
  memberships: MembershipRow[];
  limits: { maxDiscountPercent: number; maxFanoutBonus: number };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null);
  const [retiring, setRetiring] = useState<PlanRow | null>(null);
  const [confirming, setConfirming] = useState<MembershipRow | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = memberships.filter((row) => row.status === 'PENDING_PAYMENT');

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------ payment queue --- */}
      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="text-title text-ink-950">
          Awaiting payment confirmation ({pending.length})
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          A membership starts only when you confirm the money arrived. Nothing here has been charged
          by the platform.
        </p>

        {pending.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {pending.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn-200 bg-warn-50/50 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {row.customerName} · {row.planName}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-600">
                    {row.reference} · {formatPaisa(row.pricePaisa)} ·{' '}
                    {row.paymentMethod ?? 'no method recorded'} · requested{' '}
                    {formatRelative(row.createdAt)}
                  </p>
                </div>
                <Button size="sm" onClick={() => setConfirming(row)}>
                  Confirm payment
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            title="Nothing waiting"
            description="Every membership sold has had its payment confirmed."
          />
        )}
      </section>

      {/* -------------------------------------------------------- plans --- */}
      <section aria-labelledby="plans-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-heading" className="text-title text-ink-950">
            Plans
          </h2>
          <Button onClick={() => setEditing('new')}>+ New plan</Button>
        </div>
        <p className="mt-1 text-sm text-ink-600">
          Benefits are copied onto a membership when it is bought, so editing a plan changes what
          the next buyer gets — never what an existing member already paid for.
        </p>

        {plans.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {plans.map((plan) => (
              <li key={plan.id} className="rounded-2xl border border-ink-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{plan.name}</span>
                      <Badge tone={plan.isActive ? 'success' : 'neutral'}>
                        {plan.isActive ? 'Active' : 'Retired'}
                      </Badge>
                      <span className="text-xs text-ink-500">{plan.code}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-700">
                      {formatPaisa(plan.pricePaisa)} / {plan.periodDays} days · {plan.memberCount}{' '}
                      member(s)
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {plan.discountBp / 100}% off
                      {plan.maxDiscountPaisa != null
                        ? ` (max ${formatPaisa(plan.maxDiscountPaisa)})`
                        : ''}
                      {plan.guaranteeBonusDays > 0
                        ? ` · +${plan.guaranteeBonusDays} guarantee days`
                        : ''}
                      {plan.priorityFanoutBonus > 0
                        ? ` · +${plan.priorityFanoutBonus} technicians notified`
                        : ''}
                      {plan.emergencyFeeWaiverPaisa > 0
                        ? ` · emergency fee covered to ${formatPaisa(plan.emergencyFeeWaiverPaisa)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(plan)}>
                      Edit
                    </Button>
                    {plan.isActive ? (
                      <Button variant="ghost" size="sm" onClick={() => setRetiring(plan)}>
                        Retire
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            title="No plans yet"
            description="Create a plan before switching memberships on in platform settings."
          />
        )}
      </section>

      {/* --------------------------------------------------- membership --- */}
      <section aria-labelledby="all-heading">
        <h2 id="all-heading" className="text-title text-ink-950">
          All memberships ({memberships.length})
        </h2>
        {memberships.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-200">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-ink-50 text-left">
                <tr>
                  <Th>Customer</Th>
                  <Th>Plan</Th>
                  <Th>Reference</Th>
                  <Th>Status</Th>
                  <Th>Runs until</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-white">
                {memberships.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink-900">{row.customerName}</p>
                      <p className="text-xs text-ink-500">{row.customerEmail}</p>
                    </td>
                    <td className="px-3 py-2.5 text-ink-700">{row.planName}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-600">{row.reference}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-ink-700">
                      {row.endsAt ? formatDate(row.endsAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState className="mt-4" title="No memberships sold yet" />
        )}
      </section>

      {editing ? (
        <PlanDialog
          plan={editing === 'new' ? null : editing}
          limits={limits}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {retiring ? (
        <ConfirmDialog
          open
          title={`Retire “${retiring.name}”?`}
          description="It disappears from the plans page. Members who already bought it keep every benefit — their terms live on their own record, not on the plan."
          confirmLabel="Retire"
          destructive
          loading={busy}
          onClose={() => setRetiring(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.delete(`/api/admin/membership-plans/${retiring.id}`);
              toast({ tone: 'success', title: 'Plan retired' });
              setRetiring(null);
              router.refresh();
            } catch (caught) {
              toast({
                tone: 'error',
                title: 'Could not retire',
                description: caught instanceof ApiError ? caught.message : undefined,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {confirming ? (
        <ConfirmPaymentDialog
          membership={confirming}
          onClose={() => setConfirming(null)}
          onDone={() => {
            setConfirming(null);
            toast({ tone: 'success', title: 'Membership activated' });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmPaymentDialog({
  membership,
  onClose,
  onDone,
}: {
  membership: MembershipRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [externalRef, setExternalRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Confirm this payment?"
      description={`${membership.customerName} pays ${formatPaisa(membership.pricePaisa)} for ${membership.planName}. The membership starts now and runs for its full period.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Not yet
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await api.post(`/api/admin/memberships/${membership.id}/confirm`, {
                  externalRef: externalRef.trim() || null,
                });
                onDone();
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
              } finally {
                setLoading(false);
              }
            }}
          >
            Confirm and activate
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
        <TextInput
          label="Receipt or transfer reference (optional)"
          value={externalRef}
          onChange={(event) => setExternalRef(event.target.value)}
          placeholder="For example: IBFT-2024-0091"
          hint="Only confirm once you have actually seen the money. This is recorded in the audit log."
        />
      </div>
    </Dialog>
  );
}

function PlanDialog({
  plan,
  limits,
  onClose,
  onDone,
}: {
  plan: PlanRow | null;
  limits: { maxDiscountPercent: number; maxFanoutBonus: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    tagline: plan?.tagline ?? '',
    description: plan?.description ?? '',
    priceRupees: plan ? String(paisaToRupees(plan.pricePaisa)) : '',
    periodDays: String(plan?.periodDays ?? 365),
    discountPercent: String((plan?.discountBp ?? 0) / 100),
    maxDiscountRupees:
      plan?.maxDiscountPaisa != null ? String(paisaToRupees(plan.maxDiscountPaisa)) : '',
    guaranteeBonusDays: String(plan?.guaranteeBonusDays ?? 0),
    priorityFanoutBonus: String(plan?.priorityFanoutBonus ?? 0),
    emergencyFeeWaiverRupees: String(paisaToRupees(plan?.emergencyFeeWaiverPaisa ?? 0)),
    isActive: plan?.isActive ?? true,
    sortOrder: String(plan?.sortOrder ?? 0),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setLoading(true);
    setError(null);
    const body = {
      code: form.code,
      name: form.name,
      tagline: form.tagline.trim() || null,
      description: form.description,
      priceRupees: Number(form.priceRupees || 0),
      periodDays: Number(form.periodDays || 0),
      discountPercent: Number(form.discountPercent || 0),
      maxDiscountRupees: form.maxDiscountRupees.trim() ? Number(form.maxDiscountRupees) : null,
      guaranteeBonusDays: Number(form.guaranteeBonusDays || 0),
      priorityFanoutBonus: Number(form.priorityFanoutBonus || 0),
      emergencyFeeWaiverRupees: Number(form.emergencyFeeWaiverRupees || 0),
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder || 0),
    };
    try {
      if (plan) await api.patch(`/api/admin/membership-plans/${plan.id}`, body);
      else await api.post('/api/admin/membership-plans', body);
      toast({ tone: 'success', title: plan ? 'Plan updated' : 'Plan created' });
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
      title={plan ? 'Edit plan' : 'New plan'}
      description="Everything here is what the plan will promise. Keep the promises small enough to keep."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            Save plan
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

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Name"
            required
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="For example: Care Plus"
          />
          <TextInput
            label="Code"
            required
            value={form.code}
            onChange={(event) => set('code', event.target.value)}
            hint="Lowercase letters, digits and dashes. Used in links."
          />
        </div>

        <TextInput
          label="Tagline (optional)"
          value={form.tagline}
          onChange={(event) => set('tagline', event.target.value)}
          placeholder="For example: for households that call us often"
        />

        <Textarea
          label="Description"
          required
          rows={3}
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          hint="Shown on the plans page. Say plainly what the member gets."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Price (Rs.)"
            type="number"
            required
            value={form.priceRupees}
            onChange={(event) => set('priceRupees', event.target.value)}
          />
          <TextInput
            label="Period (days)"
            type="number"
            required
            value={form.periodDays}
            onChange={(event) => set('periodDays', event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Discount (%)"
            type="number"
            value={form.discountPercent}
            onChange={(event) => set('discountPercent', event.target.value)}
            hint={`Off every completed booking. Platform maximum ${limits.maxDiscountPercent}%.`}
          />
          <TextInput
            label="Discount cap per booking (Rs.)"
            type="number"
            value={form.maxDiscountRupees}
            onChange={(event) => set('maxDiscountRupees', event.target.value)}
            hint="Leave blank for no cap."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Extra guarantee days"
            type="number"
            value={form.guaranteeBonusDays}
            onChange={(event) => set('guaranteeBonusDays', event.target.value)}
            hint="Added only where a guarantee already applies."
          />
          <TextInput
            label="Extra technicians notified"
            type="number"
            value={form.priorityFanoutBonus}
            onChange={(event) => set('priorityFanoutBonus', event.target.value)}
            hint={`On top of the platform fan-out. Maximum ${limits.maxFanoutBonus}.`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Emergency fee covered (Rs.)"
            type="number"
            value={form.emergencyFeeWaiverRupees}
            onChange={(event) => set('emergencyFeeWaiverRupees', event.target.value)}
            hint="Per booking. The platform absorbs this, not the technician."
          />
          <TextInput
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(event) => set('sortOrder', event.target.value)}
          />
        </div>

        <Checkbox
          label="Active (shown on the plans page)"
          checked={form.isActive}
          onChange={(event) => set('isActive', event.target.checked)}
        />
      </div>
    </Dialog>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase text-ink-500">
      {children}
    </th>
  );
}
