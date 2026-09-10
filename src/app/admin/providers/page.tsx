import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Badge, DemoBadge } from '@/components/ui/Badge';
import { Rating } from '@/components/ui/Rating';
import { Avatar } from '@/components/marketing/ProviderCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { fileUrl } from '@/lib/storage';
import { formatRelative, cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Providers', robots: { index: false, follow: false } };

const TABS = [
  { key: 'PENDING_VERIFICATION', label: 'Verification pending' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'Sab' },
] as const;

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  await requirePermission('provider:approve');
  const query = await searchParams;
  const status = TABS.find((tab) => tab.key === query.status)?.key ?? 'PENDING_VERIFICATION';

  const providers = await prisma.providerProfile.findMany({
    where: {
      deletedAt: null,
      ...(status === 'ALL' ? {} : { status }),
      ...(query.search
        ? {
            OR: [
              { businessName: { contains: query.search, mode: 'insensitive' } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
              { contactPhone: { contains: query.search } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
    select: {
      id: true,
      businessName: true,
      status: true,
      contactPhone: true,
      yearsExperience: true,
      ratingAverage: true,
      ratingCount: true,
      completedJobs: true,
      profilePhotoId: true,
      createdAt: true,
      isDemo: true,
      user: { select: { fullName: true, email: true } },
      verifications: { select: { kind: true, status: true } },
      _count: { select: { services: true, serviceAreas: true, documents: true } },
    },
  });

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Providers</h1>
          <p className="mt-1 text-sm text-ink-600">
            Approve karne se pehle document, services aur areas check karein.
          </p>
        </div>
        <form className="flex gap-2" action="/admin/providers">
          <input type="hidden" name="status" value={status} />
          <input
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Naam, email ya phone"
            aria-label="Providers dhoondein"
            className="h-10 rounded-xl border border-ink-300 px-3.5 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Dhoondein
          </button>
        </form>
      </header>

      <nav aria-label="Provider status" className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/providers?status=${tab.key}`}
            aria-current={status === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              status === tab.key
                ? 'bg-ink-900 text-white'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {providers.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {providers.map((provider) => {
            const approved = provider.verifications.filter((v) => v.status === 'APPROVED').length;
            const incomplete = provider._count.services === 0 || provider._count.serviceAreas === 0;
            return (
              <li key={provider.id}>
                <Link
                  href={`/admin/providers/${provider.id}`}
                  className="flex flex-wrap items-start gap-4 rounded-2xl border border-ink-200 bg-white p-4 transition-shadow hover:shadow-lift"
                >
                  <Avatar
                    name={provider.businessName}
                    url={provider.profilePhotoId ? fileUrl(provider.profilePhotoId) : null}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.9375rem] font-semibold text-ink-900">
                        {provider.businessName}
                      </span>
                      {provider.isDemo ? <DemoBadge /> : null}
                      {incomplete ? <Badge tone="warn">Profile adhoori</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {provider.user.fullName} · {provider.user.email} · {provider.contactPhone}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                      <span>{provider._count.services} services</span>
                      <span>{provider._count.serviceAreas} areas</span>
                      <span>{provider._count.documents} documents</span>
                      <span>{approved}/5 verifications</span>
                      <span>{provider.completedJobs} jobs</span>
                      <span>{formatRelative(provider.createdAt)} joined</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusPill status={provider.status} />
                    <Rating
                      value={provider.ratingAverage}
                      count={provider.ratingCount}
                      size="sm"
                      showEmpty={false}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          className="mt-5"
          title="Is filter par koi provider nahi"
          description="Doosra status chunein ya search clear karein."
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'warn' | 'success' | 'danger' | 'neutral' }> = {
    PENDING_VERIFICATION: { label: 'Pending', tone: 'warn' },
    VERIFIED: { label: 'Verified', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
    SUSPENDED: { label: 'Suspended', tone: 'danger' },
  };
  const entry = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
