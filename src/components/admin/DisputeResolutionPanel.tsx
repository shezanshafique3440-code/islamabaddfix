'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatPaisa } from '@/lib/money';

const OUTCOMES = [
  { value: 'UNDER_REVIEW', label: 'Under review', needsRefund: false },
  { value: 'AWAITING_CUSTOMER', label: 'Information needed from the customer', needsRefund: false },
  { value: 'AWAITING_PROVIDER', label: 'Information needed from the provider', needsRefund: false },
  { value: 'RESOLVED_REVISIT', label: 'Resolved — re-visit approved', needsRefund: false },
  { value: 'RESOLVED_PARTIAL_REFUND', label: 'Resolved — partial refund', needsRefund: true },
  { value: 'RESOLVED_REFUND', label: 'Resolved — full refund', needsRefund: true },
  { value: 'RESOLVED_NO_ACTION', label: 'Resolved — no action', needsRefund: false },
  { value: 'CLOSED', label: 'Close', needsRefund: false },
] as const;

/**
 * Dispute resolution.
 *
 * A refund outcome is only offered when there is a paid payment to refund
 * against — the API enforces this too, but offering an impossible action would
 * waste an operator's time and look broken.
 *
 * Cash and bank refunds are executed by hand, so the panel surfaces the
 * instructions the payment layer returns rather than implying money moved.
 */
export function DisputeResolutionPanel({
  disputeId,
  status,
  refundablePaisa,
  alreadyRefundedPaisa,
  hasPaidPayment,
  resolutionNotes,
}: {
  disputeId: string;
  status: string;
  refundablePaisa: number;
  alreadyRefundedPaisa: number;
  hasPaidPayment: boolean;
  resolutionNotes: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>('UNDER_REVIEW');
  const [notes, setNotes] = useState('');
  const [refundRupees, setRefundRupees] = useState('');
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);

  const selected = OUTCOMES.find((entry) => entry.value === outcome);
  const isTerminal = status.startsWith('RESOLVED') || status === 'CLOSED';

  const available = OUTCOMES.filter(
    (entry) => !entry.needsRefund || (hasPaidPayment && refundablePaisa > 0),
  );

  return (
    <>
      <section className="rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Resolution</h2>

        {resolutionNotes ? (
          <p className="mt-2 rounded-xl bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700">
            {resolutionNotes}
          </p>
        ) : null}

        {alreadyRefundedPaisa > 0 ? (
          <p className="mt-2 text-sm text-brand-700">
            Ab tak {formatPaisa(alreadyRefundedPaisa)} refund ho chuka hai.
          </p>
        ) : null}

        {!hasPaidPayment ? (
          <p className="mt-2 text-sm text-ink-600">
            There is no paid payment on this booking, so refund options are not available.
          </p>
        ) : refundablePaisa > 0 ? (
          <p className="mt-2 text-sm text-ink-600">
            Refund ke liye {formatPaisa(refundablePaisa)} available hai.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-600">The full amount has already been refunded.</p>
        )}

        {instructions ? (
          <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 p-3.5">
            <p className="text-sm font-semibold text-warn-700">Manual action required</p>
            <p className="mt-1 text-sm text-ink-700">{instructions}</p>
          </div>
        ) : null}

        <div className="mt-4">
          <Button onClick={() => setOpen(true)} disabled={isTerminal && status === 'CLOSED'}>
            {isTerminal ? 'Update status' : 'Decide'}
          </Button>
        </div>
      </section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Dispute decision"
        description="The decision is sent to both sides by notification and recorded in the audit log."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Close
            </Button>
            <Button
              loading={loading}
              disabled={
                notes.trim().length < 4 ||
                (selected?.value === 'RESOLVED_PARTIAL_REFUND' && Number(refundRupees) <= 0)
              }
              onClick={async () => {
                setLoading(true);
                try {
                  const result = await api.post<{ refundInstructions: string | null }>(
                    `/api/admin/disputes/${disputeId}`,
                    {
                      status: outcome,
                      notes: notes.trim(),
                      ...(outcome === 'RESOLVED_PARTIAL_REFUND'
                        ? { refundRupees: Number(refundRupees) }
                        : {}),
                    },
                  );
                  setInstructions(result.refundInstructions);
                  toast({ tone: 'success', title: 'Decision recorded' });
                  setOpen(false);
                  router.refresh();
                } catch (error) {
                  toast({
                    tone: 'error',
                    title: 'Decision not recorded',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Save decision
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Decision"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            {available.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>

          {outcome === 'RESOLVED_PARTIAL_REFUND' ? (
            <TextInput
              label="Refund amount (Rs.)"
              type="number"
              min={1}
              max={refundablePaisa / 100}
              value={refundRupees}
              onChange={(event) => setRefundRupees(event.target.value)}
              hint={`Up to ${formatPaisa(refundablePaisa)}`}
              required
            />
          ) : null}

          {outcome === 'RESOLVED_REFUND' ? (
            <p className="rounded-xl bg-info-50 px-3.5 py-2.5 text-sm text-info-700">
              The full remaining refund ({formatPaisa(refundablePaisa)}) will be processed.
            </p>
          ) : null}

          <Textarea
            label="Reason for the decision"
            required
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What you found, and what you based the decision on."
            hint="This is shown to both the customer and the provider."
          />
        </div>
      </Dialog>
    </>
  );
}
