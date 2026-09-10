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
      toast({ tone: 'success', title: 'Ho gaya' });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Nahi ho saka',
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
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Faisla</h2>
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
              Approve karne se pehle yeh mukammal hona chahiye
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
              onClick={() => decide('approve', { note: 'Onboarding maloomat ka jaiza mukammal' })}
            >
              Approve karein
            </Button>
          ) : null}

          {status === 'PENDING_VERIFICATION' ? (
            <Button variant="outline" onClick={() => setDialog('reject')}>
              Reject karein
            </Button>
          ) : null}

          {status === 'VERIFIED' ? (
            <Button variant="danger" onClick={() => setDialog('suspend')}>
              Suspend karein
            </Button>
          ) : null}

          {status === 'SUSPENDED' ? (
            <Button
              loading={busy === 'reinstate'}
              onClick={() => decide('reinstate', { note: 'Suspension khatam' })}
            >
              Dobara active karein
            </Button>
          ) : null}

          <Button variant="ghost" onClick={() => setDialog('verification')}>
            Verification badge set karein
          </Button>
        </div>

        {status === 'VERIFIED' ? (
          <p className="mt-3 text-xs text-ink-500">
            Yeh provider customers ko dikh raha hai aur jobs receive kar sakta hai. Suspend karne par
            uske sessions khatam ho jayenge aur pending offers withdraw ho jayenge.
          </p>
        ) : null}
      </section>

      <ReasonDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Provider reject karein?"
        description="Wajah provider ko notification mein bheji jayegi taake woh theek kar ke dobara submit kar sakein."
        confirmLabel="Reject karein"
        loading={busy === 'reject'}
        onConfirm={(reason) => decide('reject', { reason })}
      />

      <ReasonDialog
        open={dialog === 'suspend'}
        onClose={() => setDialog(null)}
        title="Provider suspend karein?"
        description="Suspend karne par sessions revoke ho jayenge aur pending offers withdraw. Pehle se qubool ki gayi jobs waise hi rahengi — unhe manually reassign karein."
        confirmLabel="Suspend karein"
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
            Band karein
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
        label="Wajah"
        required
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Saaf aur madadgar wajah likhein."
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
      title="Verification badge set karein"
      description="Har badge alag set hota hai. Sirf woh badge approve karein jo aap ne waqai check kiya."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Band karein
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
                toast({ tone: 'success', title: 'Badge update ho gaya' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Update nahi hua',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Set karein
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Kaunsa check?"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          hint={current ? `Mojooda status: ${current.status}` : undefined}
        >
          {VERIFICATION_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select label="Naya status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="APPROVED">Approved — check mukammal</option>
          <option value="SUBMITTED">Submitted — jaiza baqi</option>
          <option value="REJECTED">Rejected — check fail</option>
          <option value="NOT_SUBMITTED">Not submitted</option>
        </Select>

        <Textarea
          label="Notes (audit log mein jayenge)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Misal: CNIC front aur back dono check kiye."
        />

        <p className="rounded-xl bg-warn-50 px-3.5 py-2.5 text-xs leading-relaxed text-warn-700">
          Yaad rahe: hum government licensing, insurance ya police background check ka dawa nahi
          karte. Sirf wohi badge approve karein jo aap ne khud verify kiya ho.
        </p>
      </div>
    </Dialog>
  );
}
