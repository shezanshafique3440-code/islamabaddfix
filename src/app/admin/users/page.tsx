import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { Badge, DemoBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatRelative, cn } from '@/lib/utils';
import { UserActions } from '@/components/admin/UserActions';
import { can } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Users', robots: { index: false, follow: false } };

const ROLES = ['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN'] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; search?: string }>;
}) {
  const ctx = await requirePermission('analytics:read');
  const query = await searchParams;
  const role = ROLES.find((entry) => entry === query.role);

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    // passwordHash is never selected.
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      lockedUntil: true,
      isDemo: true,
      createdAt: true,
      providerProfile: { select: { id: true, status: true } },
      _count: { select: { bookingsAsCustomer: true } },
    },
  });

  const canChangeRole = can(ctx.role, 'user:role:write');

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Users</h1>
          <p className="mt-1 text-sm text-ink-600">{users.length} users dikhaye ja rahe hain</p>
        </div>
        <form className="flex gap-2" action="/admin/users">
          {role ? <input type="hidden" name="role" value={role} /> : null}
          <input
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Naam, email ya phone"
            aria-label="Users dhoondein"
            className="h-10 w-56 rounded-xl border border-ink-300 px-3.5 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Dhoondein
          </button>
        </form>
      </header>

      <nav aria-label="Role filter" className="mt-5 flex flex-wrap gap-1.5">
        <Link
          href="/admin/users"
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium',
            !role ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
          )}
        >
          Sab
        </Link>
        {ROLES.map((entry) => (
          <Link
            key={entry}
            href={`/admin/users?role=${entry}`}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium',
              role === entry ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {entry.replace('_', ' ').toLowerCase()}
          </Link>
        ))}
      </nav>

      {users.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-ink-200">
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">Users</caption>
            <thead className="bg-ink-50 text-left">
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th className="text-right">Bookings</Th>
                <Th>Last login</Th>
                <Th>Joined</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {users.map((user) => (
                <tr key={user.id}>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-900">{user.fullName}</span>
                      {user.isDemo ? <DemoBadge /> : null}
                    </div>
                    <span className="block text-xs text-ink-500">{user.email}</span>
                    {user.phone ? (
                      <span className="block text-xs text-ink-500">{user.phone}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={user.role === 'CUSTOMER' ? 'neutral' : 'info'}>
                      {user.role.replace('_', ' ').toLowerCase()}
                    </Badge>
                    {user.providerProfile ? (
                      <Link
                        href={`/admin/providers/${user.providerProfile.id}`}
                        className="mt-1 block text-xs text-brand-700 hover:underline"
                      >
                        {user.providerProfile.status}
                      </Link>
                    ) : null}
                  </Td>
                  <Td>
                    {!user.isActive ? (
                      <Badge tone="danger">Disabled</Badge>
                    ) : user.lockedUntil && user.lockedUntil > new Date() ? (
                      <Badge tone="warn">Locked</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </Td>
                  <Td className="text-right text-ink-700">{user._count.bookingsAsCustomer}</Td>
                  <Td className="text-xs text-ink-500">
                    {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Kabhi nahi'}
                  </Td>
                  <Td className="text-xs text-ink-500">{formatDate(user.createdAt)}</Td>
                  <Td>
                    <UserActions
                      userId={user.id}
                      fullName={user.fullName}
                      role={user.role}
                      isActive={user.isActive}
                      isSelf={user.id === ctx.user.id}
                      canChangeRole={canChangeRole}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState className="mt-5" title="Koi user nahi mila" />
      )}
    </div>
  );
}

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
  return <td className={`px-3.5 py-3 align-top ${className ?? ''}`}>{children}</td>;
}
