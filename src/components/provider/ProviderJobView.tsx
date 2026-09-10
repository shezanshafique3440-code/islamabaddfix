'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingDetail } from '@/lib/bookings/queries';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Rating, RatingInput } from '@/components/ui/Rating';
import { Select, Textarea, TextInput } from '@/components/ui/Field';
import { QuoteCard } from '@/components/account/QuoteCard';
import { formatPaisa, splitCommission } from '@/lib/money';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { directionsUrl } from '@/lib/maps';

type QuoteItemKind = 'INSPECTION' | 'LABOUR' | 'PARTS' | 'EMERGENCY_FEE' | 'TRAVEL' | 'OTHER';

interface QuoteLine {
  kind: QuoteItemKind;
  label: string;
  quantity: number;
  rupees: string;
}

/**
 * Provider's working view of one job.
 *
 * The action bar is driven by `booking.availableActions`, which the server
 * derives from the state machine for this actor — so the buttons a technician
 * sees are exactly the transitions the API will accept, and no more.
 */
export function ProviderJobView({
  booking,
  commissionRateBp,
  isAssigned,
}: {
  booking: BookingDetail;
  commissionRateBp: number;
  isAssigned: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'quote' | 'complete' | 'rate' | 'decline'>(null);

  const actions = booking.availableActions;
  const canQuote = actions.some((action) => action.to === 'QUOTE_PENDING');
  const pendingQuote = booking.quotes.find((quote) => quote.id === booking.pendingQuoteId) ?? null;
  const hasCoordinates =
    booking.address.latitude !== null && booking.address.longitude !== null;

  async function transition(action: string, label: string, extra?: Record<string, unknown>) {
    setBusy(action);
    try {
      await api.post(`/api/provider/jobs/${booking.id}/status`, { action, ...extra });
      toast({ tone: 'success', title: label });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Kaam nahi ho saka',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setBusy(null);
      setDialog(null);
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <Link href="/provider/jobs" className="text-sm text-ink-600 hover:text-brand-700 hover:underline">
        ← Sab jobs
      </Link>

      {/* -------------------------------------------------------------- header */}
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-display-sm text-ink-950">{booking.service.name}</h1>
              {booking.isEmergency ? <Badge tone="danger">🚨 Emergency</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-ink-600">
              <span className="font-mono font-medium">{booking.reference}</span>
              {' · '}
              {formatRelative(booking.createdAt)}
            </p>
          </div>
          <StatusBadge status={booking.status} label={booking.statusLabelUr} />
        </div>
      </header>

      {!isAssigned ? (
        <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Yeh job aap ko offer hui hai</h2>
          <p className="mt-1.5 text-sm text-ink-700">
            Qubool karne par customer ka poora address aur phone number aap ko dikh jayega.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="success"
              loading={busy === 'accept'}
              onClick={() => transition('accept', 'Job qubool kar li')}
            >
              Qubool karein
            </Button>
            <Button variant="outline" onClick={() => setDialog('decline')}>
              Nahi kar sakta
            </Button>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------ pending quote */}
      {pendingQuote ? (
        <div className="rounded-2xl border border-warn-200 bg-warn-50 p-5">
          <h2 className="text-[0.9375rem] font-semibold text-warn-700">
            Quote customer ke paas hai
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Customer approve karega tab aage kaam ho sakega.
          </p>
          <QuoteCard quote={pendingQuote} className="mt-3" />
        </div>
      ) : null}

      {/* ------------------------------------------------------------- action */}
      {isAssigned && actions.length > 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Ab kya karna hai?</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {canQuote ? (
              <Button onClick={() => setDialog('quote')}>
                {booking.pricing.approvedTotalPaisa !== null
                  ? 'Extra charges bhejein'
                  : 'Quote bhejein'}
              </Button>
            ) : null}

            {actions.some((action) => action.to === 'SCHEDULED') && booking.scheduledFor ? (
              <Button
                variant="outline"
                loading={busy === 'confirm_schedule'}
                onClick={() => transition('confirm_schedule', 'Time confirm ho gaya')}
              >
                Time confirm karein
              </Button>
            ) : null}

            {actions.some((action) => action.to === 'ON_THE_WAY') ? (
              <Button
                loading={busy === 'on_the_way'}
                onClick={() => transition('on_the_way', 'Customer ko bata diya')}
              >
                Raste mein hoon
              </Button>
            ) : null}

            {actions.some((action) => action.to === 'ARRIVED') ? (
              <Button
                loading={busy === 'arrived'}
                onClick={() => transition('arrived', 'Pohonchne ki ittila bhej di')}
              >
                Pohonch gaya
              </Button>
            ) : null}

            {actions.some((action) => action.to === 'IN_PROGRESS') ? (
              <Button
                loading={busy === 'start'}
                onClick={() => transition('start', 'Kaam shuru ho gaya')}
              >
                Kaam shuru karein
              </Button>
            ) : null}

            {actions.some((action) => action.to === 'COMPLETED') ? (
              <Button variant="success" onClick={() => setDialog('complete')}>
                Kaam complete karein
              </Button>
            ) : null}

            {hasCoordinates ? (
              <a
                href={directionsUrl(
                  { latitude: booking.address.latitude!, longitude: booking.address.longitude! },
                  booking.address.addressLine ?? undefined,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-300 px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50"
              >
                🧭 Navigation
              </a>
            ) : null}
          </div>

          {booking.pricing.approvedTotalPaisa === null && !canQuote ? (
            <p className="mt-3 text-xs text-ink-500">
              Kaam complete karne se pehle customer ka approve kiya hua quote zaroori hai.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* -------------------------------------------------------- job details */}
      <section className="rounded-2xl border border-ink-200 bg-white">
        <div className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Job ki tafseel</h2>
        </div>
        <dl className="divide-y divide-ink-100">
          <Row label="Masla">
            <p className="whitespace-pre-line">{booking.problemDescription}</p>
            {booking.customerNotes ? (
              <p className="mt-1.5 rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-700">
                Customer ki hidayat: {booking.customerNotes}
              </p>
            ) : null}
          </Row>

          <Row label="Waqt">
            {booking.scheduledFor ? (
              <>
                {formatDateTime(booking.scheduledFor)}
                <span className="ml-1.5 text-xs text-ink-500">
                  (~{booking.scheduledWindowMinutes} min)
                </span>
              </>
            ) : (
              <span className="text-ink-500">Foran / tay nahi</span>
            )}
          </Row>

          <Row label="Customer">
            <p>{booking.customer.fullName}</p>
            {booking.customer.phone ? (
              isAssigned ? (
                <a
                  href={`tel:${booking.customer.phone.replace(/\s+/g, '')}`}
                  className="mt-0.5 inline-block font-medium text-brand-700 hover:underline"
                >
                  📞 {booking.customer.phone}
                </a>
              ) : (
                <p className="mt-0.5 text-xs text-ink-500">
                  {booking.customer.phone} — qubool karne par poora number milega
                </p>
              )
            ) : null}
          </Row>

          <Row label="Address">
            {booking.address.addressLine ? (
              <>
                <p>{booking.address.addressLine}</p>
                {booking.address.houseOrBuilding ? (
                  <p className="text-xs text-ink-500">{booking.address.houseOrBuilding}</p>
                ) : null}
                {booking.address.landmark ? (
                  <p className="text-xs text-ink-500">Landmark: {booking.address.landmark}</p>
                ) : null}
                <p className="text-xs text-ink-500">
                  {booking.address.zone?.name ?? booking.address.city}
                </p>
                {booking.address.contactPhone ? (
                  <a
                    href={`tel:${booking.address.contactPhone.replace(/\s+/g, '')}`}
                    className="mt-0.5 inline-block text-xs font-medium text-brand-700 hover:underline"
                  >
                    Site contact: {booking.address.contactPhone}
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <p className="font-medium">{booking.address.zone?.name ?? booking.address.city}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Poora address job qubool karne ke baad dikhega.
                </p>
              </>
            )}
          </Row>

          {booking.media.length > 0 ? (
            <Row label="Tasveerein">
              <ul className="flex flex-wrap gap-2">
                {booking.media.map((file) => (
                  <li key={file.id}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-100"
                    >
                      {file.isVideo ? (
                        <span className="flex h-full items-center justify-center text-xs text-ink-500">
                          🎬
                        </span>
                      ) : (
                        <Image
                          src={file.url}
                          alt={file.originalName}
                          width={80}
                          height={80}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}

          {booking.intakeSummary ? (
            <Row label="Intake summary">
              <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                {JSON.stringify(booking.intakeSummary, null, 2)}
              </pre>
              <p className="mt-1 text-xs text-ink-500">
                Customer ke bataye masle ka andaza — final diagnosis nahi.
              </p>
            </Row>
          ) : null}
        </dl>
      </section>

      {/* ------------------------------------------------------- money for me */}
      {booking.pricing.approvedTotalPaisa !== null ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Paise ka hisaab</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-600">
                {booking.pricing.finalTotalPaisa !== null ? 'Final total' : 'Approved total'}
              </dt>
              <dd className="font-medium text-ink-900">
                {formatPaisa(
                  booking.pricing.finalTotalPaisa ?? booking.pricing.approvedTotalPaisa,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-600">
                Platform commission ({commissionRateBp / 100}%)
              </dt>
              <dd className="text-ink-700">
                −
                {formatPaisa(
                  splitCommission(
                    booking.pricing.finalTotalPaisa ?? booking.pricing.approvedTotalPaisa,
                    commissionRateBp,
                  ).commissionPaisa,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-ink-200 pt-2">
              <dt className="font-semibold text-ink-900">Aapki kamai</dt>
              <dd className="text-lg font-bold text-brand-700">
                {formatPaisa(
                  booking.pricing.providerEarningsPaisa ??
                    splitCommission(
                      booking.pricing.finalTotalPaisa ?? booking.pricing.approvedTotalPaisa,
                      commissionRateBp,
                    ).providerEarningsPaisa,
                )}
              </dd>
            </div>
          </dl>
          {booking.pricing.finalTotalPaisa === null ? (
            <p className="mt-2 text-xs text-ink-500">
              Yeh andaza hai. Commission kaam mukammal hone ke waqt ke rate par freeze hota hai.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------------------- quotes */}
      {booking.quotes.filter((quote) => quote.id !== booking.pendingQuoteId).length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-title text-ink-950">Quote history</h2>
          {booking.quotes
            .filter((quote) => quote.id !== booking.pendingQuoteId)
            .map((quote) => (
              <QuoteCard key={quote.id} quote={quote} showStatus />
            ))}
        </section>
      ) : null}

      {/* ---------------------------------------------------- customer review */}
      {booking.review ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Customer ka review</h2>
          <div className="mt-3">
            <Rating value={booking.review.rating} />
            {booking.review.comment ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{booking.review.comment}</p>
            ) : null}
          </div>

          {booking.review.providerRatingOfCustomer ? (
            <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-600">
              Aap ne customer ko {booking.review.providerRatingOfCustomer} star diye.
            </p>
          ) : booking.status === 'COMPLETED' ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialog('rate')}>
              Customer ko rate karein
            </Button>
          ) : null}
        </section>
      ) : booking.status === 'COMPLETED' ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Feedback</h2>
          <p className="mt-1 text-sm text-ink-600">
            Customer ne abhi review nahi diya. Aap customer ko rate kar sakte hain — yeh sirf ops
            team dekhti hai.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialog('rate')}>
            Customer ko rate karein
          </Button>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- timeline */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">History</h2>
        <ol className="mt-3 space-y-3">
          {booking.timeline.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ink-900">{entry.label}</p>
                {entry.reason ? <p className="text-xs text-ink-500">{entry.reason}</p> : null}
                <p className="text-xs text-ink-400">{formatDateTime(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ dialogs */}
      <QuoteDialog
        open={dialog === 'quote'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        isAdditional={booking.pricing.approvedTotalPaisa !== null}
        emergencyFeePaisa={booking.pricing.emergencyFeePaisa}
        commissionRateBp={commissionRateBp}
        onDone={() => {
          setDialog(null);
          router.refresh();
        }}
      />
      <CompleteDialog
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        onDone={() => {
          setDialog(null);
          router.refresh();
        }}
      />
      <RateCustomerDialog
        open={dialog === 'rate'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        onDone={() => {
          setDialog(null);
          router.refresh();
        }}
      />
      <DeclineJobDialog
        open={dialog === 'decline'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        onDone={() => router.push('/provider/jobs')}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm text-ink-800">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

const ITEM_KINDS: Array<{ value: QuoteItemKind; label: string }> = [
  { value: 'INSPECTION', label: 'Muaina' },
  { value: 'LABOUR', label: 'Mazdoori' },
  { value: 'PARTS', label: 'Parts' },
  { value: 'TRAVEL', label: 'Aane jane ka kharcha' },
  { value: 'OTHER', label: 'Deegar' },
];

/**
 * Quote builder.
 *
 * Line items only — there is no total field, because the server computes the
 * total from the items. The live preview shows the technician their own take
 * after commission, so the number they care about is visible while they price.
 */
function QuoteDialog({
  open,
  onClose,
  bookingId,
  isAdditional,
  emergencyFeePaisa,
  commissionRateBp,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  isAdditional: boolean;
  emergencyFeePaisa: number;
  commissionRateBp: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [lines, setLines] = useState<QuoteLine[]>([
    { kind: 'INSPECTION', label: 'Muaina', quantity: 1, rupees: '500' },
    { kind: 'LABOUR', label: 'Mazdoori', quantity: 1, rupees: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const subtotalPaisa = lines.reduce((total, line) => {
    const rupees = Number(line.rupees);
    return total + (Number.isFinite(rupees) ? Math.round(rupees * 100) * line.quantity : 0);
  }, 0);

  // What the customer will owe, and what the provider will actually keep.
  const customerTotal = subtotalPaisa + (isAdditional ? 0 : emergencyFeePaisa);
  const earnings = splitCommission(customerTotal, commissionRateBp);

  const valid = lines.every((line) => line.label.trim().length >= 2 && Number(line.rupees) >= 0) &&
    subtotalPaisa > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isAdditional ? 'Extra charges bhejein' : 'Quote bhejein'}
      description={
        isAdditional
          ? 'Yeh customer ki alag approval maangega. Approve hone tak kaam complete nahi ho sakta.'
          : 'Har cheez alag likhein — customer ko saaf dikhna chahiye ke woh kis cheez ke paise de raha hai.'
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Band karein
          </Button>
          <Button
            loading={loading}
            disabled={!valid}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post(`/api/provider/jobs/${bookingId}/quote`, {
                  items: lines.map((line) => ({
                    kind: line.kind,
                    label: line.label.trim(),
                    quantity: line.quantity,
                    unitPriceRupees: Number(line.rupees),
                  })),
                  notes: notes.trim() || undefined,
                });
                toast({ tone: 'success', title: 'Quote customer ko bhej diya' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Quote nahi gaya',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Quote bhejein
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="space-y-3">
          {lines.map((line, index) => (
            <li key={index} className="rounded-xl border border-ink-200 p-3">
              <div className="grid gap-3 sm:grid-cols-[9rem_1fr_5rem_7rem]">
                <Select
                  label="Qism"
                  value={line.kind}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, kind: event.target.value as QuoteItemKind } : entry,
                      ),
                    )
                  }
                >
                  {ITEM_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </Select>
                <TextInput
                  label="Tafseel"
                  value={line.label}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, label: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Misal: capacitor"
                />
                <TextInput
                  label="Tadad"
                  type="number"
                  min={1}
                  value={String(line.quantity)}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index
                          ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) }
                          : entry,
                      ),
                    )
                  }
                />
                <TextInput
                  label="Rate (Rs.)"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={line.rupees}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, rupees: event.target.value } : entry,
                      ),
                    )
                  }
                />
              </div>
              {lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  className="mt-2 text-xs font-medium text-alert-600 hover:underline"
                >
                  Yeh line hatayein
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setLines((current) => [
              ...current,
              { kind: 'PARTS', label: '', quantity: 1, rupees: '' },
            ])
          }
        >
          + Line add karein
        </Button>

        <Textarea
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Misal: parts ki warranty 3 mahine."
        />

        <div className="rounded-xl bg-ink-50 p-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-600">Quote subtotal</dt>
              <dd className="font-medium text-ink-900">{formatPaisa(subtotalPaisa)}</dd>
            </div>
            {!isAdditional && emergencyFeePaisa > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-600">Emergency fee (pehle bataya gaya)</dt>
                <dd className="text-ink-700">{formatPaisa(emergencyFeePaisa)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-ink-200 pt-1.5">
              <dt className="font-semibold text-ink-900">Customer dega</dt>
              <dd className="font-bold text-ink-950">{formatPaisa(customerTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-600">Commission ({commissionRateBp / 100}%)</dt>
              <dd className="text-ink-700">−{formatPaisa(earnings.commissionPaisa)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink-900">Aapki kamai</dt>
              <dd className="font-bold text-brand-700">
                {formatPaisa(earnings.providerEarningsPaisa)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Dialog>
  );
}

function CompleteDialog({
  open,
  onClose,
  bookingId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [loading, setLoading] = useState(false);

  async function uploadProof(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let count = 0;
    for (const file of Array.from(files).slice(0, 5)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'COMPLETION_PROOF');
      formData.append('bookingId', bookingId);
      try {
        await api.upload('/api/files', formData);
        count += 1;
      } catch (error) {
        toast({
          tone: 'error',
          title: `"${file.name}" upload nahi hui`,
          description: error instanceof ApiError ? error.message : undefined,
        });
      }
    }
    setUploaded((current) => current + count);
    setUploading(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kaam complete karein"
      description="Complete karne par customer ko payment aur review ke liye kaha jayega."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Band karein
          </Button>
          <Button
            variant="success"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post(`/api/provider/jobs/${bookingId}/status`, {
                  action: 'complete',
                  notes: notes.trim() || undefined,
                });
                toast({ tone: 'success', title: 'Kaam complete mark ho gaya' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Complete nahi ho saka',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Complete karein
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-800">
            Kaam ki tasveerein <span className="text-ink-400">(recommended)</span>
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={(event) => uploadProof(event.target.files)}
            disabled={uploading}
            className="block w-full text-sm text-ink-600 file:mr-3 file:h-10 file:cursor-pointer file:rounded-xl file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 disabled:opacity-50"
          />
          <p className="mt-1.5 text-xs text-ink-500">
            Completion photos dispute ki soorat mein aap ke haq mein sabooot banti hain.
          </p>
          {uploading ? (
            <p className="mt-1 text-sm text-ink-600" aria-live="polite">
              Upload ho rahi hai...
            </p>
          ) : uploaded > 0 ? (
            <p className="mt-1 text-sm text-brand-700">{uploaded} tasveer upload ho gayi</p>
          ) : null}
        </div>

        <Textarea
          label="Kaam ke notes (optional)"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Kya kiya, kaunsa part badla, koi hidayat customer ke liye..."
        />
      </div>
    </Dialog>
  );
}

function RateCustomerDialog({
  open,
  onClose,
  bookingId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Customer ko rate karein"
      description="Yeh rating sirf ops team dekhti hai — doosre customers ko nahi dikhti."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Band karein
          </Button>
          <Button
            loading={loading}
            disabled={rating === 0}
            onClick={async () => {
              setLoading(true);
              try {
                await api.put(`/api/bookings/${bookingId}/review`, {
                  rating,
                  comment: comment.trim() || undefined,
                });
                toast({ tone: 'success', title: 'Rating record ho gayi' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Rating nahi gayi',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Rating dein
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RatingInput
          name="customerRating"
          label="Customer ka rawayya kaisa tha?"
          value={rating}
          onChange={setRating}
        />
        <Textarea
          label="Notes (optional)"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Misal: address theek tha, waqt par mila."
        />
      </div>
    </Dialog>
  );
}

function DeclineJobDialog({
  open,
  onClose,
  bookingId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Job decline karein?"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Rehne dein
          </Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post(`/api/provider/jobs/${bookingId}/status`, {
                  action: 'decline',
                  reason: reason.trim() || undefined,
                });
                toast({ tone: 'info', title: 'Job decline kar di' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Decline nahi ho saki',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Decline karein
          </Button>
        </>
      }
    >
      <Textarea
        label="Wajah (optional)"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </Dialog>
  );
}
