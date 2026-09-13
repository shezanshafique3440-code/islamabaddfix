'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPaisa } from '@/lib/money';
import { formatDate } from '@/lib/utils';

interface PendingRow {
  providerId: string;
  businessName: string;
  bankLabel: string;
  jobs: number;
  earningsPaisa: number;
  earliest: string | null;
  latest: string | null;
}

interface PayoutRow {
  id: string;
  status: string;
  providerName: string;
  bankLabel: string;
  periodStart: string;
  periodEnd: string;
  grossPaisa: number;
  commissionPaisa: number;
  netPaisa: number;
  reference: string | null;
  itemCount: number;
  processedAt: string | null;
}

/**
 * Payout management.
 *
 * Building a payout snapshots the commission split already frozen on each
 * booking; it never recomputes commission at today's rate, so a later rate
 * change cannot retroactively alter what a provider earned.
 *
 * Marking one paid records that a human sent the money — automated bank
 * transfers are a later phase and the copy does not pretend otherwise.
 */
export function PayoutManager({
  pending,
  payouts,
  totalPendingPaisa,
}: {
  pending: PendingRow[];
  payouts: PayoutRow[];
  totalPendingPaisa: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState<PendingRow | null>(null);
  const [marking, setMarking] = useState<PayoutRow | null>(null);

  return (
    <div className="space-y-8">
      <section aria-labelledby="pending-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="pending-heading" className="text-title text-ink-950">
            Awaiting payout
          </h2>
          {totalPendingPaisa > 0 ? (
            <p className="text-sm font-semibold text-ink-900">
              Kul {formatPaisa(totalPendingPaisa)}
            </p>
          ) : null}
        </div>

        {pending.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-200">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">Providers awaiting payout</caption>
              <thead className="bg-ink-50 text-left">
                <tr>
                  <Th>Provider</Th>
                  <Th>Payout account</Th>
                  <Th className="text-right">Jobs</Th>
                  <Th className="text-right">Earnings</Th>
                  <Th>Period</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-surface">
                {pending.map((row) => (
                  <tr key={row.providerId}>
                    <Td className="font-medium text-ink-900">{row.businessName}</Td>
                    <Td className="text-xs text-ink-600">{row.bankLabel}</Td>
                    <Td className="text-right text-ink-700">{row.jobs}</Td>
                    <Td className="text-right font-semibold text-ink-900">
                      {formatPaisa(row.earningsPaisa)}
                    </Td>
                    <Td className="text-xs text-ink-500">
                      {row.earliest ? formatDate(row.earliest) : '—'} –{' '}
                      {row.latest ? formatDate(row.latest) : '—'}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setCreating(row)}>
                          Create payout
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="Everything is settled"
            description="No completed job is without a payout."
          />
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-title text-ink-950">
          Payout history
        </h2>
        {payouts.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-ink-200 bg-surface p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">
                      {payout.providerName}
                    </span>
                    <Badge
                      tone={
                        payout.status === 'PAID'
                          ? 'success'
                          : payout.status === 'FAILED'
                            ? 'danger'
                            : 'warn'
                      }
                    >
                      {payout.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)} ·{' '}
                    {payout.itemCount} bookings · {payout.bankLabel}
                  </p>
                  <p className="mt-1 text-xs text-ink-600">
                    Gross {formatPaisa(payout.grossPaisa)} · Commission{' '}
                    {formatPaisa(payout.commissionPaisa)}
                    {payout.reference ? ` · Ref ${payout.reference}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-lg font-bold text-ink-950">
                    {formatPaisa(payout.netPaisa)}
                  </span>
                  {payout.status !== 'PAID' ? (
                    <Button size="sm" onClick={() => setMarking(payout)}>
                      Mark as paid
                    </Button>
                  ) : payout.processedAt ? (
                    <span className="text-xs text-ink-500">{formatDate(payout.processedAt)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState className="mt-4" title="No payouts recorded yet" />
        )}
      </section>

      <CreatePayoutDialog
        key={creating?.providerId ?? 'closed'}
        row={creating}
        onClose={() => setCreating(null)}
        onDone={() => {
          setCreating(null);
          router.refresh();
        }}
      />

      <MarkPaidDialog
        payout={marking}
        onClose={() => setMarking(null)}
        onDone={() => {
          setMarking(null);
          router.refresh();
        }}
      />
    </div>
  );

  function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
    return (
      <th
        scope="col"
        className={`px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${className ?? ''}`}
      >
        {children}
      </th>
    );
  }

  function Td({ children, className }: { children: React.ReactNode; className?: string }) {
    return <td className={`px-3.5 py-3 ${className ?? ''}`}>{children}</td>;
  }
}

function CreatePayoutDialog({
  row,
  onClose,
  onDone,
}: {
  row: PendingRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [periodStart, setPeriodStart] = useState(row?.earliest?.slice(0, 10) ?? '');
  const [periodEnd, setPeriodEnd] = useState(row?.latest?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={`${row?.businessName} ke liye payout`}
      description="Only completed bookings that are not already in a payout will be included."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            disabled={!periodStart || !periodEnd}
            onClick={async () => {
              if (!row) return;
              setLoading(true);
              try {
                await api.post('/api/admin/payouts', {
                  providerId: row.providerId,
                  periodStart: new Date(`${periodStart}T00:00:00`).toISOString(),
                  periodEnd: new Date(`${periodEnd}T23:59:59`).toISOString(),
                  notes: notes.trim() || undefined,
                });
                toast({ tone: 'success', title: 'Payout created' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Payout not created',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Create payout
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {row ? (
          <div className="rounded-xl bg-ink-50 p-3.5 text-sm">
            <p className="text-ink-700">
              {row.jobs} jobs · {formatPaisa(row.earningsPaisa)} provider earnings
            </p>
            <p className="mt-0.5 text-xs text-ink-500">{row.bankLabel}</p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Period start"
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            required
          />
          <TextInput
            label="Period end"
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            required
          />
        </div>
        <Textarea
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Dialog>
  );
}

function MarkPaidDialog({
  payout,
  onClose,
  onDone,
}: {
  payout: PayoutRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={payout !== null}
      onClose={onClose}
      title="Mark payout as paid"
      description="This records that the bank transfer happened. The transfer itself takes place outside this system."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              if (!payout) return;
              setLoading(true);
              try {
                await api.post(`/api/admin/payouts/${payout.id}`, {
                  reference: reference.trim() || undefined,
                  notes: notes.trim() || undefined,
                });
                toast({ tone: 'success', title: 'Payout marked as paid' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Not marked',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Mark as paid
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {payout ? (
          <div className="rounded-xl bg-ink-50 p-3.5 text-sm">
            <p className="font-semibold text-ink-900">{formatPaisa(payout.netPaisa)}</p>
            <p className="text-xs text-ink-600">
              {payout.providerName} · {payout.bankLabel}
            </p>
          </div>
        ) : null}
        <TextInput
          label="Bank transfer reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="For example: IBFT-2024-0091"
          hint="Kept for reconciliation."
        />
        <Textarea
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Dialog>
  );
}
