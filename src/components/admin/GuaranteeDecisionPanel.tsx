'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Select, Textarea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';

const OUTCOMES = [
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'APPROVED', label: 'Approved — entitled to a re-visit' },
  { value: 'REVISIT_SCHEDULED', label: 'Re-visit ka time set' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Not approved' },
] as const;

/**
 * Guarantee claim decision.
 *
 * Also records who bears the cost of an approved re-visit. That is a real
 * commercial decision and defaults from platform settings, so it is surfaced
 * rather than buried.
 */
export function GuaranteeDecisionPanel({
  claimId,
  status,
  providerResponsible,
  revisitScheduledFor,
  reviewNotes,
}: {
  claimId: string;
  status: string;
  providerResponsible: boolean | null;
  revisitScheduledFor: string | null;
  reviewNotes: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>('UNDER_REVIEW');
  const [notes, setNotes] = useState('');
  const [revisitAt, setRevisitAt] = useState('');
  const [providerPays, setProviderPays] = useState(providerResponsible ?? true);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Decision</h2>

        {reviewNotes ? (
          <p className="mt-2 rounded-xl bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700">
            {reviewNotes}
          </p>
        ) : null}

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Current status</dt>
            <dd className="text-ink-900">{status}</dd>
          </div>
          {revisitScheduledFor ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Re-visit</dt>
              <dd className="text-ink-900">{formatDateTime(revisitScheduledFor)}</dd>
            </div>
          ) : null}
          {providerResponsible !== null ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Who pays</dt>
              <dd className="text-ink-900">{providerResponsible ? 'Provider' : 'Platform'}</dd>
            </div>
          ) : null}
        </dl>

        <Button className="mt-4" onClick={() => setOpen(true)}>
          Update decision
        </Button>
      </section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Guarantee claim decision"
        description="The decision is sent to both the customer and the provider and recorded in the audit log."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Close
            </Button>
            <Button
              loading={loading}
              disabled={
                notes.trim().length < 4 ||
                (outcome === 'REVISIT_SCHEDULED' && revisitAt.length === 0)
              }
              onClick={async () => {
                setLoading(true);
                try {
                  await api.post(`/api/admin/guarantees/${claimId}`, {
                    status: outcome,
                    notes: notes.trim(),
                    ...(outcome === 'REVISIT_SCHEDULED'
                      ? { revisitScheduledFor: new Date(revisitAt).toISOString() }
                      : {}),
                    providerResponsible: providerPays,
                  });
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
              Save
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
            {OUTCOMES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>

          {outcome === 'REVISIT_SCHEDULED' ? (
            <TextInput
              label="Re-visit time"
              type="datetime-local"
              value={revisitAt}
              onChange={(event) => setRevisitAt(event.target.value)}
              required
            />
          ) : null}

          {outcome === 'APPROVED' || outcome === 'REVISIT_SCHEDULED' ? (
            <Checkbox
              label="The provider bears the cost of the re-visit"
              checked={providerPays}
              onChange={(event) => setProviderPays(event.target.checked)}
              hint="Uncheck and the platform absorbs the cost."
            />
          ) : null}

          <Textarea
            label="Reason for the decision"
            required
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What you found and what you based the decision on."
          />
        </div>
      </Dialog>
    </>
  );
}
