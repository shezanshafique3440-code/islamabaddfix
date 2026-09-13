'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

const VERIFICATION_KINDS = [
  { value: 'IDENTITY_CNIC', label: 'Identity (CNIC)' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PLATFORM_ONBOARDING', label: 'Platform onboarding review' },
  { value: 'BANK_ACCOUNT', label: 'Payout account' },
] as const;

/**
 * Provider decision panel.
 *
 * Two deliberate design choices:
 *  1. Approval is blocked while the provider is not actually bookable (no
 *     services or areas) or the identity document is missing. Approving anyway
 *     would make the "verified" badge mean nothing.
 *  2. Each verification badge is set individually, so approving the identity
 *     check cannot silently imply a background check the platform never did.
 */
export function ProviderReviewPanel({
  providerId,
  status,
  blockers,
  verifications,
  rejectedReason,
  suspendedReason,
}: {
  providerId: string;
  status: string;
  blockers: string[];
  verifications: Array<{
    kind: string;
    status: string;
    reference: string | null;
    notes: string | null;
    reviewedAt: string | null;
  }>;
  rejectedReason: string | null;
  suspendedReason: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'reject' | 'suspend' | 'verification'>(null);

  async function decide(action: string, body?: Record<string, unknown>) {
    setBusy(action);
    try {
      await api.post(`/api/admin/providers/${providerId}`, { action, ...body });
      toast({ tone: 'success', title: 'Done' });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not be done',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setBusy(null);
      setDialog(null);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Decision</h2>
          <Badge
            tone={
              status === 'VERIFIED'
                ? 'success'
                : status === 'PENDING_VERIFICATION'
                  ? 'warn'
                  : 'danger'
            }
          >
            {status}
          </Badge>
        </div>

        {rejectedReason ? (
          <p className="mt-2 text-sm text-alert-600">Reject ki wajah: {rejectedReason}</p>
        ) : null}
        {suspendedReason ? (
          <p className="mt-2 text-sm text-alert-600">Suspend ki wajah: {suspendedReason}</p>
        ) : null}

        {blockers.length > 0 && status !== 'VERIFIED' ? (
          <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 p-3.5">
            <p className="text-sm font-semibold text-warn-700">
              This must be complete before approval
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-700">
              {blockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {status !== 'VERIFIED' && status !== 'SUSPENDED' ? (
            <Button
              variant="success"
              loading={busy === 'approve'}
              disabled={blockers.length > 0}
              onClick={() => decide('approve', { note: 'Onboarding details reviewed' })}
            >
              Approve
            </Button>
          ) : null}

          {status === 'PENDING_VERIFICATION' ? (
            <Button variant="outline" onClick={() => setDialog('reject')}>
              Reject
            </Button>
          ) : null}

          {status === 'VERIFIED' ? (
            <Button variant="danger" onClick={() => setDialog('suspend')}>
              Suspend
            </Button>
          ) : null}

          {status === 'SUSPENDED' ? (
            <Button
              loading={busy === 'reinstate'}
              onClick={() => decide('reinstate', { note: 'Suspension lifted' })}
            >
              Reactivate
            </Button>
          ) : null}

          <Button variant="ghost" onClick={() => setDialog('verification')}>
            Set verification badge
          </Button>
        </div>

        {status === 'VERIFIED' ? (
          <p className="mt-3 text-xs text-ink-500">
            This provider is visible to customers and can receive jobs. Suspending them ends their
            sessions and withdraws any pending offers.
          </p>
        ) : null}
      </section>

      <ReasonDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Reject this provider?"
        description="The reason is sent to the provider in a notification so they can fix it and resubmit."
        confirmLabel="Reject"
        loading={busy === 'reject'}
        onConfirm={(reason) => decide('reject', { reason })}
      />

      <ReasonDialog
        open={dialog === 'suspend'}
        onClose={() => setDialog(null)}
        title="Suspend this provider?"
        description="Suspending revokes their sessions and withdraws pending offers. Jobs already accepted stay as they are — reassign those manually."
        confirmLabel="Suspend"
        destructive
        loading={busy === 'suspend'}
        onConfirm={(reason) => decide('suspend', { reason })}
      />

      <VerificationDialog
        open={dialog === 'verification'}
        onClose={() => setDialog(null)}
        providerId={providerId}
        verifications={verifications}
        onDone={() => {
          setDialog(null);
          router.refresh();
        }}
      />
    </>
  );
}

function ReasonDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  destructive,
  loading,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={loading}
            disabled={reason.trim().length < 4}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea
        label="Reason"
        required
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Give a clear, helpful reason."
      />
    </Dialog>
  );
}

function VerificationDialog({
  open,
  onClose,
  providerId,
  verifications,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  providerId: string;
  verifications: Array<{ kind: string; status: string }>;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<string>('IDENTITY_CNIC');
  const [status, setStatus] = useState<string>('APPROVED');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const current = verifications.find((verification) => verification.kind === kind);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set verification badge"
      description="Each badge is set separately. Only approve a badge you have actually verified."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post(`/api/admin/providers/${providerId}/verification`, {
                  kind,
                  status,
                  notes: notes.trim() || undefined,
                });
                toast({ tone: 'success', title: 'Badge updated' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Not updated',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Set
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Which check?"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          hint={current ? `Current status: ${current.status}` : undefined}
        >
          {VERIFICATION_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          label="New status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="APPROVED">Approved — checks complete</option>
          <option value="SUBMITTED">Submitted — review pending</option>
          <option value="REJECTED">Rejected — check fail</option>
          <option value="NOT_SUBMITTED">Not submitted</option>
        </Select>

        <Textarea
          label="Notes (these go into the audit log)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="For example: checked both the front and back of the CNIC."
        />

        <p className="rounded-xl bg-warn-50 px-3.5 py-2.5 text-xs leading-relaxed text-warn-700">
          Remember: we do not claim government licensing, insurance or police background checks.
          Only approve a badge you have verified yourself.
        </p>
      </div>
    </Dialog>
  );
}
