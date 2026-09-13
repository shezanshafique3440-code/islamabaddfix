'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import { cn } from '@/lib/utils';

interface NavGroup {
  label: string;
  links: Array<{
    href: string;
    label: string;
    exact?: boolean;
    countKey?: keyof Counts;
    superAdminOnly?: boolean;
  }>;
}

interface Counts {
  providers: number;
  disputes: number;
  guarantees: number;
  support: number;
  bookings: number;
  memberships: number;
}

const GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    links: [
      { href: '/admin', label: 'Dashboard', exact: true },
      { href: '/admin/analytics', label: 'Analytics' },
      { href: '/admin/map', label: 'Operations map' },
    ],
  },
  {
    label: 'Queues',
    links: [
      { href: '/admin/providers', label: 'Providers', countKey: 'providers' },
      { href: '/admin/bookings', label: 'Bookings', countKey: 'bookings' },
      { href: '/admin/disputes', label: 'Disputes', countKey: 'disputes' },
      { href: '/admin/guarantees', label: 'Guarantee claims', countKey: 'guarantees' },
      { href: '/admin/support', label: 'Support', countKey: 'support' },
    ],
  },
  {
    label: 'Configuration',
    links: [
      { href: '/admin/catalogue', label: 'Categories & services' },
      { href: '/admin/zones', label: 'Service areas' },
      { href: '/admin/settings', label: 'Platform settings' },
    ],
  },
  {
    label: 'Money & people',
    links: [
      { href: '/admin/payouts', label: 'Payouts' },
      { href: '/admin/memberships', label: 'Memberships', countKey: 'memberships' },
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

export function AdminSidebar({ role, counts }: { role: Role; counts: Counts }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav aria-label="Admin" className="sticky top-24 space-y-5">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-500">
              {group.label}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {group.links
                .filter((link) => !link.superAdminOnly || role === 'SUPER_ADMIN')
                .map((link) => {
                  const active = link.exact
                    ? pathname === link.href
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);
                  const count = link.countKey ? counts[link.countKey] : 0;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-brand-50 text-brand-800'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )}
                    >
                      {link.label}
                      {count > 0 ? (
                        <span className="rounded-full bg-alert-500 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}

        <p className="px-3 text-xs text-ink-500">
          Signed in as {role === 'SUPER_ADMIN' ? 'super admin' : 'admin'}
        </p>
      </nav>
    </aside>
  );
}
