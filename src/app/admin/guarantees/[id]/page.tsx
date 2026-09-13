import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { GUARANTEE_STATUS_LABELS } from '@/lib/bookings/disputes';
import { Badge } from '@/components/ui/Badge';
import { Rating } from '@/components/ui/Rating';
import { GuaranteeDecisionPanel } from '@/components/admin/GuaranteeDecisionPanel';
import { fileUrl } from '@/lib/storage';
import { formatPaisa } from '@/lib/money';
import { formatDate, formatDateTime } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Guarantee claim',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function AdminGuaranteeDetailPage({ params }: Params) {
  await requirePermission('guarantee:decide');
  const { id } = await params;

  const claim = await prisma.guaranteeClaim.findUnique({
    where: { id },
    include: {
      files: { where: { deletedAt: null }, select: { id: true, originalName: true } },
      booking: {
        include: {
          service: { select: { name: true, guaranteeEligible: true } },
          customer: { select: { fullName: true, phone: true, email: true } },
          provider: { select: { id: true, businessName: true, contactPhone: true } },
          address: { include: { zone: { select: { name: true } } } },
          files: {
            where: { deletedAt: null },
            select: { id: true, originalName: true, isCompletionProof: true },
          },
          review: { select: { rating: true, comment: true } },
        },
      },
    },
  });

  if (!claim) notFound();

  const expired =
    claim.booking.guaranteeExpiresAt !== null && claim.booking.guaranteeExpiresAt < new Date();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/guarantees"
        className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
      >
        ← All claims
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-display-sm text-ink-950">Guarantee claim</h1>
          <Badge
            tone={
              claim.status === 'REJECTED'
                ? 'danger'
                : claim.status === 'RESOLVED'
                  ? 'success'
                  : 'warn'
            }
          >
            {GUARANTEE_STATUS_LABELS[claim.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-ink-600">
          <span className="font-mono">{claim.reference}</span> · {formatDateTime(claim.createdAt)}
        </p>
      </header>

      {/* Eligibility facts, stated up front — these decide the claim. */}
      <section className="rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Eligibility</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            label="Guarantee on booking"
            value={claim.booking.guaranteeEligible ? 'Yes' : 'No'}
            tone={claim.booking.guaranteeEligible ? 'good' : 'bad'}
          />
          <Fact label="Period" value={`${claim.booking.guaranteeDays} days`} />
          <Fact
            label="Ends"
            value={
              claim.booking.guaranteeExpiresAt ? formatDate(claim.booking.guaranteeExpiresAt) : '—'
            }
            tone={expired ? 'bad' : 'good'}
          />
          <Fact
            label="Work complete"
            value={claim.booking.completedAt ? formatDate(claim.booking.completedAt) : '—'}
          />
        </dl>
        {expired ? (
          <p className="mt-3 rounded-xl bg-warn-50 px-3.5 py-2.5 text-sm text-warn-700">
            The guarantee period has ended. Decide based on whether it was still valid when the
            claim was submitted.
          </p>
        ) : null}
      </section>

      <GuaranteeDecisionPanel
        claimId={claim.id}
        status={claim.status}
        providerResponsible={claim.providerResponsible}
        revisitScheduledFor={claim.revisitScheduledFor?.toISOString() ?? null}
        reviewNotes={claim.reviewNotes}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Customer ka claim">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">
            {claim.description}
          </p>
          {claim.files.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm">
              {claim.files.map((file) => (
                <li key={file.id}>
                  <a
                    href={fileUrl(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    {file.originalName}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Original booking">
          <dl className="space-y-2 text-sm">
            <Row label="Reference" value={claim.booking.reference} />
            <Row label="Service" value={claim.booking.service.name} />
            <Row label="Customer" value={claim.booking.customer.fullName} />
            <Row label="Provider" value={claim.booking.provider?.businessName ?? '—'} />
            <Row
              label="Area"
              value={claim.booking.address.zone?.name ?? claim.booking.address.city}
            />
            <Row
              label="Total"
              value={
                claim.booking.finalTotalPaisa ? formatPaisa(claim.booking.finalTotalPaisa) : '—'
              }
            />
          </dl>
          <p className="mt-3 whitespace-pre-line border-t border-ink-100 pt-3 text-sm text-ink-700">
            {claim.booking.problemDescription}
          </p>
          {claim.booking.providerNotes ? (
            <p className="mt-2 text-sm text-ink-600">
              <strong className="font-semibold">Provider notes:</strong>{' '}
              {claim.booking.providerNotes}
            </p>
          ) : null}
        </Panel>

        {claim.booking.files.length > 0 ? (
          <Panel title="Original booking media">
            <ul className="space-y-1.5 text-sm">
              {claim.booking.files.map((file) => (
                <li key={file.id} className="flex items-center gap-2">
                  <a
                    href={fileUrl(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    {file.originalName}
                  </a>
                  {file.isCompletionProof ? <Badge tone="neutral">Completion proof</Badge> : null}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {claim.booking.review ? (
          <Panel title="Customer ka review">
            <Rating value={claim.booking.review.rating} />
            {claim.booking.review.comment ? (
              <p className="mt-2 text-sm text-ink-700">{claim.booking.review.comment}</p>
            ) : null}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-surface p-5">
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

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd
        className={
          tone === 'good'
            ? 'mt-0.5 text-sm font-semibold text-brand-700'
            : tone === 'bad'
              ? 'mt-0.5 text-sm font-semibold text-alert-600'
              : 'mt-0.5 text-sm font-semibold text-ink-900'
        }
      >
        {value}
      </dd>
    </div>
  );
}
