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
  { value: 'UNDER_REVIEW', label: 'Under review — jaiza jari hai', needsRefund: false },
  { value: 'AWAITING_CUSTOMER', label: 'Customer se maloomat chahiye', needsRefund: false },
  { value: 'AWAITING_PROVIDER', label: 'Provider se maloomat chahiye', needsRefund: false },
  { value: 'RESOLVED_REVISIT', label: 'Hal — dobara visit manzoor', needsRefund: false },
  { value: 'RESOLVED_PARTIAL_REFUND', label: 'Hal — juzvi refund', needsRefund: true },
  { value: 'RESOLVED_REFUND', label: 'Hal — poora refund', needsRefund: true },
  { value: 'RESOLVED_NO_ACTION', label: 'Hal — koi karwai nahi', needsRefund: false },
  { value: 'CLOSED', label: 'Band karein', needsRefund: false },
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
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
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
            Is booking par koi paid payment nahi hai, is liye refund ke options available nahi.
          </p>
        ) : refundablePaisa > 0 ? (
          <p className="mt-2 text-sm text-ink-600">
            Refund ke liye {formatPaisa(refundablePaisa)} available hai.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-600">Poori raqam pehle refund ho chuki hai.</p>
        )}

        {instructions ? (
          <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 p-3.5">
            <p className="text-sm font-semibold text-warn-700">Manual karwai darkar hai</p>
            <p className="mt-1 text-sm text-ink-700">{instructions}</p>
          </div>
        ) : null}

        <div className="mt-4">
          <Button onClick={() => setOpen(true)} disabled={isTerminal && status === 'CLOSED'}>
            {isTerminal ? 'Status update karein' : 'Faisla karein'}
          </Button>
        </div>
      </section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Dispute ka faisla"
        description="Faisla dono taraf ko notification se bhej diya jayega aur audit log mein darj hoga."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Band karein
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
                  toast({ tone: 'success', title: 'Faisla record ho gaya' });
                  setOpen(false);
                  router.refresh();
                } catch (error) {
                  toast({
                    tone: 'error',
                    title: 'Faisla record nahi hua',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Faisla save karein
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Faisla"
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
              hint={`Zyada se zyada ${formatPaisa(refundablePaisa)}`}
              required
            />
          ) : null}

          {outcome === 'RESOLVED_REFUND' ? (
            <p className="rounded-xl bg-info-50 px-3.5 py-2.5 text-sm text-info-700">
              Poora baqi refund ({formatPaisa(refundablePaisa)}) process hoga.
            </p>
          ) : null}

          <Textarea
            label="Faisle ki wajah"
            required
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Kya maloom hua, kis buniyad par faisla kiya."
            hint="Yeh customer aur provider dono ko dikhayi jayegi."
          />
        </div>
      </Dialog>
    </>
  );
}
