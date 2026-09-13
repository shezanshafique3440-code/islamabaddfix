import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { DISPUTE_REASON_LABELS, DISPUTE_STATUS_LABELS } from '@/lib/bookings/disputes';
import { Badge } from '@/components/ui/Badge';
import { QuoteCard } from '@/components/account/QuoteCard';
import { DisputeResolutionPanel } from '@/components/admin/DisputeResolutionPanel';
import { fileUrl } from '@/lib/storage';
import { formatPaisa } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dispute', robots: { index: false, follow: false } };

type Params = { params: Promise<{ id: string }> };

export default async function AdminDisputeDetailPage({ params }: Params) {
  await requirePermission('dispute:resolve');
  const { id } = await params;

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      files: {
        where: { deletedAt: null },
        select: { id: true, originalName: true, mimeType: true },
      },
      booking: {
        include: {
          service: { select: { name: true, category: { select: { name: true } } } },
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          provider: { select: { id: true, businessName: true, contactPhone: true, slug: true } },
          address: { include: { zone: { select: { name: true } } } },
          quotes: { include: { items: true }, orderBy: { createdAt: 'desc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
          files: {
            where: { deletedAt: null },
            select: { id: true, originalName: true, mimeType: true, isCompletionProof: true },
          },
          review: true,
        },
      },
    },
  });

  if (!dispute) notFound();

  const paidPayment = dispute.booking.payments.find(
    (payment) => payment.status === 'PAID' || payment.status === 'PARTIALLY_REFUNDED',
  );
  const refundable = paidPayment ? paidPayment.amountPaisa - paidPayment.refundedPaisa : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/disputes"
        className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
      >
        ← Sab disputes
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-display-sm text-ink-950">{DISPUTE_REASON_LABELS[dispute.reason]}</h1>
          <Badge tone={dispute.status.startsWith('RESOLVED') ? 'success' : 'danger'}>
            {DISPUTE_STATUS_LABELS[dispute.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-ink-600">
          <span className="font-mono">{dispute.reference}</span> ·{' '}
          {formatDateTime(dispute.createdAt)}
        </p>
      </header>

      <DisputeResolutionPanel
        disputeId={dispute.id}
        status={dispute.status}
        refundablePaisa={refundable}
        alreadyRefundedPaisa={dispute.refundPaisa}
        hasPaidPayment={paidPayment !== undefined}
        resolutionNotes={dispute.resolutionNotes}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Customer’s complaint">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">
            {dispute.description}
          </p>
          {dispute.files.length > 0 ? (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Evidence</p>
              <ul className="mt-2 space-y-1.5">
                {dispute.files.map((file) => (
                  <li key={file.id}>
                    <a
                      href={fileUrl(file.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-700 hover:underline"
                    >
                      {file.originalName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel title="Parties">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Customer
              </dt>
              <dd className="mt-0.5 text-ink-900">{dispute.booking.customer.fullName}</dd>
              <dd className="text-xs text-ink-600">{dispute.booking.customer.email}</dd>
              {dispute.booking.customer.phone ? (
                <dd className="text-xs">
                  <a
                    href={`tel:${dispute.booking.customer.phone.replace(/\s+/g, '')}`}
                    className="text-brand-700 hover:underline"
                  >
                    {dispute.booking.customer.phone}
                  </a>
                </dd>
              ) : null}
            </div>
            {dispute.booking.provider ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Provider
                </dt>
                <dd className="mt-0.5">
                  <Link
                    href={`/admin/providers/${dispute.booking.provider.id}`}
                    className="text-ink-900 hover:text-brand-700 hover:underline"
                  >
                    {dispute.booking.provider.businessName}
                  </Link>
                </dd>
                <dd className="text-xs">
                  <a
                    href={`tel:${dispute.booking.provider.contactPhone.replace(/\s+/g, '')}`}
                    className="text-brand-700 hover:underline"
                  >
                    {dispute.booking.provider.contactPhone}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </Panel>

        <Panel title="Booking">
          <dl className="space-y-2 text-sm">
            <Row label="Reference" value={dispute.booking.reference} />
            <Row label="Service" value={dispute.booking.service.name} />
            <Row label="Status" value={dispute.booking.status} />
            <Row
              label="Area"
              value={dispute.booking.address.zone?.name ?? dispute.booking.address.city}
            />
            <Row label="Address" value={dispute.booking.address.addressLine} />
            <Row
              label="Approved total"
              value={
                dispute.booking.approvedTotalPaisa
                  ? formatPaisa(dispute.booking.approvedTotalPaisa)
                  : '—'
              }
            />
            <Row
              label="Final total"
              value={
                dispute.booking.finalTotalPaisa ? formatPaisa(dispute.booking.finalTotalPaisa) : '—'
              }
            />
            <Row
              label="Commission"
              value={
                dispute.booking.commissionPaisa ? formatPaisa(dispute.booking.commissionPaisa) : '—'
              }
            />
          </dl>
          <p className="mt-3 whitespace-pre-line border-t border-ink-100 pt-3 text-sm text-ink-700">
            {dispute.booking.problemDescription}
          </p>
        </Panel>

        <Panel title="Payments">
          {dispute.booking.payments.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {dispute.booking.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-ink-900">{formatPaisa(payment.amountPaisa)}</span>
                    <span className="block text-xs text-ink-500">
                      {payment.method}
                      {payment.refundedPaisa > 0
                        ? ` · refunded ${formatPaisa(payment.refundedPaisa)}`
                        : ''}
                    </span>
                  </span>
                  <Badge tone={payment.status === 'PAID' ? 'success' : 'neutral'}>
                    {payment.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">No payment record.</p>
          )}
        </Panel>

        {dispute.booking.quotes.length > 0 ? (
          <Panel title="Quotes" className="lg:col-span-2">
            <div className="space-y-3">
              {dispute.booking.quotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  showStatus
                  quote={{
                    id: quote.id,
                    status: quote.status,
                    isAdditional: quote.isAdditional,
                    subtotalPaisa: quote.subtotalPaisa,
                    notes: quote.notes,
                    validUntil: quote.validUntil,
                    submittedAt: quote.submittedAt,
                    rejectionReason: quote.rejectionReason,
                    items: quote.items.map((item) => ({
                      id: item.id,
                      kind: item.kind,
                      label: item.label,
                      quantity: item.quantity,
                      unitPricePaisa: item.unitPricePaisa,
                      totalPaisa: item.unitPricePaisa * item.quantity,
                    })),
                  }}
                />
              ))}
            </div>
          </Panel>
        ) : null}

        {dispute.booking.files.length > 0 ? (
          <Panel title="Booking media" className="lg:col-span-2">
            <ul className="space-y-1.5 text-sm">
              {dispute.booking.files.map((file) => (
                <li key={file.id} className="flex items-center gap-2">
                  <a
                    href={fileUrl(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    {file.originalName}
                  </a>
                  {file.isCompletionProof ? (
                    <Badge tone="neutral">Provider completion proof</Badge>
                  ) : (
                    <Badge tone="neutral">Customer evidence</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Booking timeline" className="lg:col-span-2">
          <ol className="space-y-2.5">
            {dispute.booking.statusHistory.map((entry) => (
              <li key={entry.id} className="flex gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300"
                />
                <div>
                  <p className="text-ink-900">
                    {entry.fromStatus ? `${entry.fromStatus} → ` : ''}
                    {entry.toStatus}
                  </p>
                  {entry.reason ? <p className="text-xs text-ink-500">{entry.reason}</p> : null}
                  <p className="text-xs text-ink-500">{formatDateTime(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-ink-200 bg-surface p-5 ${className ?? ''}`}>
      <h2 className="text-[0.9375rem] font-semibold text-ink-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="text-right text-ink-900">{value}</dd>
    </div>
  );
}
