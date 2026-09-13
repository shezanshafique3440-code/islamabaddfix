import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { VERIFICATION_LABELS } from '@/lib/providers/service';
import { getSetting } from '@/lib/settings';
import { fileUrl } from '@/lib/storage';
import { formatPaisa } from '@/lib/money';
import { formatDate, DAY_NAMES, minutesToTimeLabel } from '@/lib/utils';
import { Avatar } from '@/components/marketing/ProviderCard';
import { Rating } from '@/components/ui/Rating';
import { Badge } from '@/components/ui/Badge';
import { ProviderReviewPanel } from '@/components/admin/ProviderReviewPanel';
import type { VerificationKind } from '@prisma/client';

export const metadata: Metadata = {
  title: 'Provider review',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function AdminProviderDetailPage({ params }: Params) {
  await requirePermission('provider:approve');
  const { id } = await params;

  const [provider, requireCnic] = await Promise.all([
    prisma.providerProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
            createdAt: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
          },
        },
        verifications: { orderBy: { kind: 'asc' } },
        services: {
          include: { service: { select: { name: true, category: { select: { name: true } } } } },
        },
        serviceAreas: { include: { zone: { select: { name: true } } } },
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        _count: { select: { bookings: true, reviews: true } },
      },
    }),
    getSetting('providers.requireCnicForVerification'),
  ]);

  if (!provider) notFound();

  const identityVerification = provider.verifications.find((v) => v.kind === 'IDENTITY_CNIC');
  const blockers: string[] = [];
  if (provider.services.length === 0) blockers.push('No service selected');
  if (provider.serviceAreas.length === 0) blockers.push('No service area selected');
  if (requireCnic && (!identityVerification || identityVerification.status === 'NOT_SUBMITTED')) {
    blockers.push('No identity document submitted');
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/providers"
        className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
      >
        ← Sab providers
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Avatar
          name={provider.businessName}
          url={provider.profilePhotoId ? fileUrl(provider.profilePhotoId) : null}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-display-sm text-ink-950">{provider.businessName}</h1>
          <p className="mt-1 text-sm text-ink-600">
            {provider.user.fullName} · {provider.user.email}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Rating value={provider.ratingAverage} count={provider.ratingCount} size="sm" />
            <span className="text-sm text-ink-600">{provider.completedJobs} jobs completed</span>
            <span className="text-sm text-ink-600">{provider._count.bookings} total bookings</span>
            <span className="text-sm text-ink-600">
              Member since {formatDate(provider.createdAt)}
            </span>
          </div>
        </div>
      </header>

      <ProviderReviewPanel
        providerId={provider.id}
        status={provider.status}
        blockers={blockers}
        verifications={provider.verifications.map((verification) => ({
          kind: verification.kind,
          status: verification.status,
          reference: verification.reference,
          notes: verification.notes,
          reviewedAt: verification.reviewedAt?.toISOString() ?? null,
        }))}
        rejectedReason={provider.rejectedReason}
        suspendedReason={provider.suspendedReason}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Contact and information">
          <dl className="space-y-2 text-sm">
            <Row label="Business phone" value={provider.contactPhone} />
            <Row label="Account phone" value={provider.user.phone ?? '—'} />
            <Row label="Email" value={provider.user.email} />
            <Row label="Address" value={provider.addressLine ?? '—'} />
            <Row label="Sector" value={provider.sector ?? '—'} />
            <Row label="Experience" value={`${provider.yearsExperience} years`} />
            <Row label="Service radius" value={`${provider.serviceRadiusKm} km`} />
            <Row
              label="Emergency"
              value={
                provider.emergencyAvailable
                  ? `Yes · ${formatPaisa(provider.emergencyFeePaisa)}`
                  : 'No'
              }
            />
            <Row label="Max active jobs" value={String(provider.maxActiveJobs)} />
            <Row label="Location sharing" value={provider.shareLiveLocation ? 'On' : 'Off'} />
          </dl>
          {provider.description ? (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Details</p>
              <p className="mt-1.5 whitespace-pre-line text-sm text-ink-700">
                {provider.description}
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel title="Payout account">
          <dl className="space-y-2 text-sm">
            <Row label="Account title" value={provider.bankAccountTitle ?? '—'} />
            <Row label="Bank" value={provider.bankName ?? '—'} />
            <Row
              label="IBAN"
              value={provider.bankAccountLast4 ? `•••• ${provider.bankAccountLast4}` : '—'}
            />
          </dl>
          {/* States the storage decision, so nobody looks for the full number. */}
          <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
            The full IBAN is not stored — only the last 4 digits and a hash. Confirm the account
            with the provider when making a payout.
          </p>
        </Panel>

        <Panel title={`Services (${provider.services.length})`}>
          {provider.services.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {provider.services.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-ink-800">{entry.service.name}</span>
                    <span className="block text-xs text-ink-500">
                      {entry.service.category.name}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-ink-900">
                    From {formatPaisa(entry.startingPricePaisa)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-warn-700">No service selected.</p>
          )}
        </Panel>

        <Panel title={`Service areas (${provider.serviceAreas.length})`}>
          {provider.serviceAreas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {provider.serviceAreas.map((area) => (
                <span
                  key={area.id}
                  className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700"
                >
                  {area.zone.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-warn-700">No area selected.</p>
          )}

          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Working hours
            </p>
            {provider.availability.length > 0 ? (
              <dl className="mt-2 space-y-1 text-sm">
                {provider.availability.map((window) => (
                  <div key={window.id} className="flex justify-between gap-3">
                    <dt className="text-ink-600">{DAY_NAMES[window.dayOfWeek]}</dt>
                    <dd className="text-ink-900">
                      {minutesToTimeLabel(window.startMinute)} –{' '}
                      {minutesToTimeLabel(window.endMinute)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1.5 text-sm text-ink-500">Working hours not set.</p>
            )}
          </div>
        </Panel>

        <Panel title={`Documents (${provider.documents.length})`} className="lg:col-span-2">
          {provider.documents.length > 0 ? (
            <ul className="space-y-2">
              {provider.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {document.originalName}
                    </p>
                    <p className="text-xs text-ink-500">
                      {document.mimeType} · {Math.round(document.sizeBytes / 1024)} KB ·{' '}
                      {formatDate(document.createdAt)}
                    </p>
                  </div>
                  <a
                    href={fileUrl(document.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">No document uploaded.</p>
          )}
          <p className="mt-3 text-xs text-ink-500">
            🔒 Only the provider and the ops team can see these documents. Every access attempt is
            recorded in the audit log.
          </p>
        </Panel>

        <Panel title="Verification checklist" className="lg:col-span-2">
          <ul className="space-y-2.5">
            {provider.verifications.map((verification) => {
              const info = VERIFICATION_LABELS[verification.kind as VerificationKind];
              return (
                <li key={verification.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {info?.en ?? verification.kind}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-500">{info?.help}</p>
                    {verification.reference ? (
                      <p className="mt-0.5 text-xs text-ink-600">Ref: {verification.reference}</p>
                    ) : null}
                    {verification.notes ? (
                      <p className="mt-0.5 text-xs text-ink-600">Notes: {verification.notes}</p>
                    ) : null}
                  </div>
                  <Badge
                    tone={
                      verification.status === 'APPROVED'
                        ? 'success'
                        : verification.status === 'REJECTED'
                          ? 'danger'
                          : verification.status === 'SUBMITTED'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {verification.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
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
    <section className={`rounded-2xl border border-ink-200 bg-white p-5 ${className ?? ''}`}>
      <h2 className="text-[0.9375rem] font-semibold text-ink-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right text-ink-900">{value}</dd>
    </div>
  );
}
