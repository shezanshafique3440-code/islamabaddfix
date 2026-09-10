'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { BookingDetail } from '@/lib/bookings/queries';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge, DemoBadge, StatusBadge, VerifiedBadge } from '@/components/ui/Badge';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Rating, RatingInput } from '@/components/ui/Rating';
import { Avatar } from '@/components/marketing/ProviderCard';
import { RadioCard, Select, Textarea } from '@/components/ui/Field';
import { formatPaisa } from '@/lib/money';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { BookingTracker } from './BookingTracker';
import { QuoteCard } from './QuoteCard';

interface PaymentMethodOption {
  method: 'CASH' | 'BANK_TRANSFER' | 'ONLINE_GATEWAY';
  label: string;
  labelUr: string;
  description: string;
}

/**
 * Customer's view of one booking.
 *
 * This is the screen that has to actually work: approving a quote, recording
 * payment, leaving a review, claiming the guarantee and opening a dispute all
 * happen here, and every one of them is a real API call whose result is
 * reflected by refreshing server data rather than by optimistic local state.
 */
export function BookingDetailView({
  booking,
  paymentMethods,
  freeCancelMinutes,
}: {
  booking: BookingDetail;
  paymentMethods: PaymentMethodOption[];
  freeCancelMinutes: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    null | 'cancel' | 'review' | 'dispute' | 'guarantee' | 'payment'
  >(null);

  const pendingQuote = booking.quotes.find((quote) => quote.id === booking.pendingQuoteId) ?? null;
  const unpaidPayment = booking.payments.find(
    (payment) => payment.status === 'PENDING' || payment.status === 'AUTHORIZED',
  );
  const hasSettledPayment = booking.payments.some((payment) => payment.status === 'PAID');
  const canCancel = booking.availableActions.some((action) => action.to === 'CANCELLED');

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
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
      {/* ------------------------------------------------------------- header */}
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-display-sm text-ink-950">{booking.service.name}</h1>
              {booking.isEmergency ? <Badge tone="danger">🚨 Emergency</Badge> : null}
              {booking.isDemo ? <DemoBadge /> : null}
            </div>
            <p className="mt-1 text-sm text-ink-600">
              <span className="font-mono font-medium">{booking.reference}</span>
              {' · '}
              {formatRelative(booking.createdAt)} banayi
            </p>
          </div>
          <StatusBadge status={booking.status} label={booking.statusLabelUr} />
        </div>

        <BookingTracker status={booking.status} step={booking.trackerStep} className="mt-6" />
      </header>

      {/* -------------------------------------------------- pending quote CTA */}
      {pendingQuote ? (
        <section className="rounded-2xl border-2 border-warn-300 bg-warn-50 p-5">
          <h2 className="text-title text-ink-950">
            {pendingQuote.isAdditional ? 'Extra charges ki approval chahiye' : 'Quote aa gaya'}
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            {pendingQuote.isAdditional
              ? 'Technician ne kaam ke doran extra charges bheje hain. Aap ki approval ke baghair kaam complete nahi hoga.'
              : 'Tafseel dekh kar approve ya reject karein. Approve karne ke baad hi kaam shuru hoga.'}
          </p>

          <QuoteCard quote={pendingQuote} className="mt-4" />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="success"
              loading={busy === 'approve'}
              onClick={() =>
                run('approve', async () => {
                  await api.post(`/api/bookings/${booking.id}/quotes`, {
                    decision: 'approve',
                    quoteId: pendingQuote.id,
                  });
                  toast({ tone: 'success', title: 'Quote approve ho gaya' });
                })
              }
            >
              Approve Quote — {formatPaisa(pendingQuote.subtotalPaisa)}
            </Button>
            <Button
              variant="outline"
              loading={busy === 'reject'}
              onClick={() =>
                run('reject', async () => {
                  await api.post(`/api/bookings/${booking.id}/quotes`, {
                    decision: 'reject',
                    quoteId: pendingQuote.id,
                  });
                  toast({ tone: 'info', title: 'Quote reject kar diya' });
                })
              }
            >
              Reject Quote
            </Button>
            <Button variant="ghost" onClick={() => setDialog('dispute')}>
              Sawal poochein
            </Button>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ details */}
      <section className="rounded-2xl border border-ink-200 bg-white">
        <div className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Booking ki tafseel</h2>
        </div>
        <dl className="divide-y divide-ink-100">
          <Row label="Masla">
            <p className="whitespace-pre-line">{booking.problemDescription}</p>
            {booking.customerNotes ? (
              <p className="mt-1.5 text-xs text-ink-500">Hidayat: {booking.customerNotes}</p>
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
              <span className="text-ink-500">Abhi tay nahi hua</span>
            )}
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
              </>
            ) : (
              <span className="text-ink-500">{booking.address.zone?.name ?? 'Islamabad'}</span>
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
                      title={
                        file.isCompletionProof
                          ? 'Technician ki completion photo'
                          : file.originalName
                      }
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
              {booking.media.some((file) => file.isCompletionProof) ? (
                <p className="mt-1.5 text-xs text-ink-500">
                  Kuch tasveerein technician ne kaam mukammal hone par bheji hain.
                </p>
              ) : null}
            </Row>
          ) : null}

          {booking.providerNotes ? (
            <Row label="Technician ke notes">
              <p className="whitespace-pre-line">{booking.providerNotes}</p>
            </Row>
          ) : null}
        </dl>
      </section>

      {/* ----------------------------------------------------------- provider */}
      {booking.provider ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Aapka technician</h2>
          <div className="mt-3 flex items-start gap-3.5">
            <Avatar name={booking.provider.businessName} url={booking.provider.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">{booking.provider.businessName}</p>
              {booking.provider.headline ? (
                <p className="text-xs text-ink-600">{booking.provider.headline}</p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Rating
                  value={booking.provider.ratingAverage}
                  count={booking.provider.ratingCount}
                  size="sm"
                />
                <span className="text-xs text-ink-500">
                  {booking.provider.completedJobs} jobs
                </span>
                {booking.provider.yearsExperience > 0 ? (
                  <span className="text-xs text-ink-500">
                    {booking.provider.yearsExperience} saal
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3">
                {booking.provider.badges.map((badge) => (
                  <VerifiedBadge key={badge} label={badgeLabel(badge)} />
                ))}
              </div>
            </div>
            {booking.provider.contactPhone ? (
              <a
                href={`tel:${booking.provider.contactPhone.replace(/\s+/g, '')}`}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-ink-300 px-3.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
              >
                📞 Call
              </a>
            ) : null}
          </div>
        </section>
      ) : booking.status === 'PENDING' || booking.status === 'PROVIDER_NOTIFIED' ? (
        <section className="rounded-2xl border border-info-100 bg-info-50 p-5">
          <p className="text-sm font-medium text-info-700">Technician dhoonda ja raha hai</p>
          <p className="mt-1 text-sm text-info-700/90">
            Jaise hi koi technician qubool karega, aap ko notification mil jayega.
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ pricing */}
      {booking.pricing.approvedTotalPaisa !== null || booking.quotes.length > 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white">
          <div className="border-b border-ink-200 px-5 py-4">
            <h2 className="text-[0.9375rem] font-semibold text-ink-900">Qeemat</h2>
          </div>
          <div className="space-y-4 p-5">
            {booking.quotes
              .filter((quote) => quote.status !== 'SUBMITTED')
              .map((quote) => (
                <QuoteCard key={quote.id} quote={quote} showStatus />
              ))}

            <dl className="space-y-1.5 border-t border-ink-100 pt-3 text-sm">
              {booking.pricing.emergencyFeePaisa > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">Emergency fee</dt>
                  <dd className="text-ink-800">
                    {formatPaisa(booking.pricing.emergencyFeePaisa)}
                  </dd>
                </div>
              ) : null}
              {booking.pricing.discountPaisa > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">
                    Discount {booking.pricing.promoCode ? `(${booking.pricing.promoCode})` : ''}
                  </dt>
                  <dd className="text-brand-700">
                    −{formatPaisa(booking.pricing.discountPaisa)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-ink-200 pt-2">
                <dt className="font-semibold text-ink-900">
                  {booking.pricing.finalTotalPaisa !== null ? 'Final total' : 'Approved total'}
                </dt>
                <dd className="text-lg font-bold text-ink-950">
                  {formatPaisa(
                    booking.pricing.finalTotalPaisa ?? booking.pricing.approvedTotalPaisa ?? 0,
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ payment */}
      {booking.status === 'COMPLETED' || booking.payments.length > 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Payment</h2>

          {booking.payments.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {booking.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {formatPaisa(payment.amountPaisa)}
                    </p>
                    <p className="text-xs text-ink-500">
                      {payment.method === 'CASH'
                        ? 'Cash on service'
                        : payment.method === 'BANK_TRANSFER'
                          ? 'Bank transfer'
                          : 'Card / wallet'}
                      {payment.paidAt ? ` · ${formatDateTime(payment.paidAt)}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      payment.status === 'PAID'
                        ? 'success'
                        : payment.status === 'REFUNDED' || payment.status === 'PARTIALLY_REFUNDED'
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {payment.status === 'PAID'
                      ? 'Paid'
                      : payment.status === 'PENDING'
                        ? 'Baqi hai'
                        : payment.status === 'REFUNDED'
                          ? 'Refunded'
                          : payment.status === 'PARTIALLY_REFUNDED'
                            ? 'Juzvi refund'
                            : payment.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}

          {booking.status === 'COMPLETED' && !hasSettledPayment ? (
            <div className="mt-4">
              {unpaidPayment ? (
                <Button
                  loading={busy === 'settle'}
                  onClick={() =>
                    run('settle', async () => {
                      await api.patch(`/api/bookings/${booking.id}/payment`, {
                        paymentId: unpaidPayment.id,
                      });
                      toast({ tone: 'success', title: 'Payment record ho gayi' });
                    })
                  }
                >
                  Cash de diya — record karein
                </Button>
              ) : (
                <Button onClick={() => setDialog('payment')}>Payment record karein</Button>
              )}
              <p className="mt-2 text-xs text-ink-500">
                Technician ko cash dene ke baad yahan record karein taake dono taraf hisaab saaf
                rahe.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------------------- review */}
      {booking.status === 'COMPLETED' ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Aapka review</h2>
          {booking.review ? (
            <div className="mt-3">
              <Rating value={booking.review.rating} />
              {booking.review.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  {booking.review.comment}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-500">
                {formatRelative(booking.review.createdAt)} diya gaya
              </p>
            </div>
          ) : (
            <>
              <p className="mt-1.5 text-sm text-ink-600">
                Aapki rating doosre customers ko behtar technician chunne mein madad karti hai.
              </p>
              <Button className="mt-3" onClick={() => setDialog('review')}>
                Review dein
              </Button>
            </>
          )}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- guarantee */}
      {booking.guarantee.eligible && booking.status === 'COMPLETED' ? (
        <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-brand-900">
            🛡️ {booking.guarantee.days}-din Fix Guarantee
          </h2>
          {booking.guarantee.isActive ? (
            <>
              <p className="mt-1.5 text-sm text-brand-900/85">
                Guarantee{' '}
                {booking.guarantee.expiresAt
                  ? formatDateTime(booking.guarantee.expiresAt)
                  : ''}{' '}
                tak active hai. Wohi masla wapis aaye to re-visit request karein.
              </p>
              {booking.guarantee.claims.length === 0 ? (
                <Button variant="outline" className="mt-3" onClick={() => setDialog('guarantee')}>
                  Re-visit request karein
                </Button>
              ) : (
                <ul className="mt-3 space-y-2">
                  {booking.guarantee.claims.map((claim) => (
                    <li key={claim.id} className="rounded-lg bg-white/70 px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-ink-600">{claim.reference}</span>
                      <span className="ml-2 font-medium text-ink-900">{claim.status}</span>
                      {claim.revisitScheduledFor ? (
                        <span className="ml-2 text-xs text-ink-600">
                          Visit: {formatDateTime(claim.revisitScheduledFor)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-sm text-brand-900/85">
              Guarantee ki muddat khatam ho gayi hai.
            </p>
          )}
        </section>
      ) : null}

      {/* ----------------------------------------------------------- disputes */}
      {booking.disputes.length > 0 ? (
        <section className="rounded-2xl border border-alert-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Disputes</h2>
          <ul className="mt-3 space-y-3">
            {booking.disputes.map((dispute) => (
              <li key={dispute.id} className="rounded-xl bg-alert-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-600">{dispute.reference}</span>
                  <Badge tone="danger">{dispute.status}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-ink-800">{dispute.description}</p>
                {dispute.resolutionNotes ? (
                  <p className="mt-2 border-t border-alert-200 pt-2 text-sm text-ink-700">
                    <strong className="font-semibold">Faisla:</strong> {dispute.resolutionNotes}
                  </p>
                ) : null}
                {dispute.refundPaisa > 0 ? (
                  <p className="mt-1 text-sm font-medium text-brand-700">
                    Refund: {formatPaisa(dispute.refundPaisa)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- timeline */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Booking ki history</h2>
        <ol className="mt-3 space-y-3">
          {booking.timeline.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{entry.labelUr}</p>
                {entry.reason ? <p className="text-xs text-ink-500">{entry.reason}</p> : null}
                <p className="text-xs text-ink-400">{formatDateTime(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ actions */}
      <section className="flex flex-wrap gap-2">
        {canCancel ? (
          <Button variant="outline" onClick={() => setDialog('cancel')}>
            Booking cancel karein
          </Button>
        ) : null}
        {(booking.status === 'COMPLETED' || booking.status === 'IN_PROGRESS') &&
        booking.disputes.length === 0 ? (
          <Button variant="ghost" onClick={() => setDialog('dispute')}>
            Masla report karein
          </Button>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ dialogs */}
      <CancelDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        scheduledFor={booking.scheduledFor}
        freeCancelMinutes={freeCancelMinutes}
        onDone={() => router.refresh()}
      />
      <ReviewDialog
        open={dialog === 'review'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        onDone={() => router.refresh()}
      />
      <DisputeDialog
        open={dialog === 'dispute'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        onDone={() => router.refresh()}
      />
      <GuaranteeDialog
        open={dialog === 'guarantee'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        onDone={() => router.refresh()}
      />
      <PaymentDialog
        open={dialog === 'payment'}
        onClose={() => setDialog(null)}
        bookingId={booking.id}
        methods={paymentMethods}
        amountPaisa={booking.pricing.finalTotalPaisa ?? booking.pricing.approvedTotalPaisa ?? 0}
        onDone={() => router.refresh()}
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

function badgeLabel(kind: string): string {
  const labels: Record<string, string> = {
    IDENTITY_CNIC: 'Identity verified',
    PHONE: 'Phone verified',
    EMAIL: 'Email verified',
    PLATFORM_ONBOARDING: 'Platform verified',
    BANK_ACCOUNT: 'Payout verified',
  };
  return labels[kind] ?? kind;
}

// ------------------------------------------------------------------ dialogs

function CancelDialog({
  open,
  onClose,
  bookingId,
  scheduledFor,
  freeCancelMinutes,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  scheduledFor: Date | string | null;
  freeCancelMinutes: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Warn about the fee before they commit, not after.
  const insideWindow =
    scheduledFor !== null &&
    new Date(scheduledFor).getTime() - Date.now() < freeCancelMinutes * 60_000;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Booking cancel karein?"
      description={
        insideWindow
          ? `Scheduled waqt qareeb hai, is liye late cancellation fee laagu ho sakti hai.`
          : 'Is waqt cancel karna free hai.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Rehne dein
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={reason.trim().length < 4}
            onClick={async () => {
              setLoading(true);
              try {
                const result = await api.post<{ message: string }>(
                  `/api/bookings/${bookingId}/cancel`,
                  { reason: reason.trim() },
                );
                toast({ tone: 'success', title: result.message });
                onClose();
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Cancel nahi ho saki',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Cancel karein
          </Button>
        </>
      }
    >
      <Textarea
        label="Cancel karne ki wajah"
        required
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Misal: masla khud theek ho gaya"
      />
    </Dialog>
  );
}

function ReviewDialog({
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
  const [scores, setScores] = useState({
    serviceQuality: 0,
    professionalism: 0,
    punctuality: 0,
    valueForMoney: 0,
  });
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Apna experience batayein"
      description="Sirf mukammal booking par review diya ja sakta hai, aur ek hi baar."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Baad mein
          </Button>
          <Button
            loading={loading}
            disabled={rating === 0}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post(`/api/bookings/${bookingId}/review`, {
                  rating,
                  comment: comment.trim() || undefined,
                  ...Object.fromEntries(
                    Object.entries(scores).filter(([, value]) => value > 0),
                  ),
                });
                toast({ tone: 'success', title: 'Review ke liye shukriya!' });
                onClose();
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Review submit nahi hua',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Review submit karein
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RatingInput name="rating" label="Overall rating" value={rating} onChange={setRating} />

        <div className="grid gap-3 sm:grid-cols-2">
          <RatingInput
            name="serviceQuality"
            label="Kaam ki quality"
            size="md"
            value={scores.serviceQuality}
            onChange={(value) => setScores((s) => ({ ...s, serviceQuality: value }))}
          />
          <RatingInput
            name="professionalism"
            label="Rawayya"
            size="md"
            value={scores.professionalism}
            onChange={(value) => setScores((s) => ({ ...s, professionalism: value }))}
          />
          <RatingInput
            name="punctuality"
            label="Waqt ki pabandi"
            size="md"
            value={scores.punctuality}
            onChange={(value) => setScores((s) => ({ ...s, punctuality: value }))}
          />
          <RatingInput
            name="valueForMoney"
            label="Paise ka sahi istemal"
            size="md"
            value={scores.valueForMoney}
            onChange={(value) => setScores((s) => ({ ...s, valueForMoney: value }))}
          />
        </div>

        <Textarea
          label="Kuch likhna chahenge? (optional)"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Kaam kaisa raha, technician ka rawayya kaisa tha..."
        />
      </div>
    </Dialog>
  );
}

const DISPUTE_REASONS = [
  { value: 'TECHNICIAN_NO_SHOW', label: 'Technician nahi aaya' },
  { value: 'POOR_SERVICE', label: 'Kaam theek nahi hua' },
  { value: 'WRONG_PRICE', label: 'Ghalat qeemat li gayi' },
  { value: 'UNAUTHORIZED_CHARGE', label: 'Bina ijazat extra charge' },
  { value: 'DAMAGE', label: 'Nuqsan hua' },
  { value: 'OTHER', label: 'Koi aur wajah' },
];

function DisputeDialog({
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
  const [reason, setReason] = useState('POOR_SERVICE');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Masla report karein"
      description="Ops team dono taraf se maloomat le kar faisla karti hai."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Band karein
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={description.trim().length < 15}
            onClick={async () => {
              setLoading(true);
              try {
                const result = await api.post<{ reference: string }>(
                  `/api/bookings/${bookingId}/dispute`,
                  { reason, description: description.trim() },
                );
                toast({
                  tone: 'success',
                  title: `Dispute darj ho gaya — ${result.reference}`,
                  description: 'Ops team jald rabta karegi.',
                });
                onClose();
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Dispute darj nahi hua',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Dispute darj karein
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Wajah"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          {DISPUTE_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Textarea
          label="Tafseel"
          required
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Kya hua, kab hua, aur aap kya chahte hain?"
          hint="Kam az kam 15 characters."
        />
      </div>
    </Dialog>
  );
}

function GuaranteeDialog({
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
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Re-visit request karein"
      description="Batayein wohi masla kaise wapis aaya. Har claim ka jaiza ops team karti hai — manzoori khud-ba-khud nahi hoti."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Band karein
          </Button>
          <Button
            loading={loading}
            disabled={description.trim().length < 15}
            onClick={async () => {
              setLoading(true);
              try {
                const result = await api.post<{ reference: string }>(
                  `/api/bookings/${bookingId}/guarantee`,
                  { description: description.trim() },
                );
                toast({
                  tone: 'success',
                  title: `Claim jama ho gaya — ${result.reference}`,
                });
                onClose();
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Claim jama nahi hua',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Claim jama karein
          </Button>
        </>
      }
    >
      <Textarea
        label="Masla kya hai?"
        required
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Misal: teen din baad AC ne phir cooling band kar di."
        hint="Kam az kam 15 characters."
      />
    </Dialog>
  );
}

function PaymentDialog({
  open,
  onClose,
  bookingId,
  methods,
  amountPaisa,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  methods: PaymentMethodOption[];
  amountPaisa: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod] = useState(methods[0]?.method ?? 'CASH');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Payment record karein"
      description={`Total ${formatPaisa(amountPaisa)}. Yeh record rakhta hai ke paise diye ja chuke hain.`}
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
                const created = await api.post<{
                  payment: { id: string; status: string };
                  note: string | null;
                }>(`/api/bookings/${bookingId}/payment`, { method });

                // Cash starts PENDING; settle it in the same flow so the
                // customer is not left with a half-finished action.
                if (method === 'CASH' && created.payment.status === 'PENDING') {
                  await api.patch(`/api/bookings/${bookingId}/payment`, {
                    paymentId: created.payment.id,
                  });
                }
                toast({ tone: 'success', title: 'Payment record ho gayi' });
                onClose();
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Payment record nahi hui',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Record karein
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {methods.map((option) => (
          <RadioCard
            key={option.method}
            checked={method === option.method}
            onSelect={() => setMethod(option.method)}
          >
            <span className="block text-sm font-semibold text-ink-900">{option.labelUr}</span>
            <span className="mt-0.5 block text-xs text-ink-600">{option.description}</span>
          </RadioCard>
        ))}
      </div>
    </Dialog>
  );
}

export { ConfirmDialog };
