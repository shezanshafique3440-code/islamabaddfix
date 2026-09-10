'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/account', label: 'Meri bookings', exact: true },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/notifications', label: 'Notifications', badgeKey: 'unread' },
  { href: '/account/support', label: 'Support' },
  { href: '/account/profile', label: 'Profile' },
];

/** Desktop sidebar; the phone equivalent is the bottom nav. */
export function AccountSidebar({ unread }: { unread: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-52 shrink-0 md:block">
      <nav aria-label="Account" className="sticky top-24 space-y-1">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              {link.label}
              {link.badgeKey === 'unread' && unread > 0 ? (
                <span className="rounded-full bg-alert-500 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Link>
          );
        })}

        <div className="pt-3">
          <Link
            href="/book"
            className="flex h-10 items-center justify-center rounded-xl bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800"
          >
            + Nayi booking
          </Link>
        </div>
      </nav>
    </aside>
  );
}
