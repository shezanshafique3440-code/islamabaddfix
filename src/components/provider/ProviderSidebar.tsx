'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/provider', label: 'Aaj ka kaam', exact: true },
  { href: '/provider/jobs', label: 'Sab jobs', badge: 'offers' },
  { href: '/provider/earnings', label: 'Earnings' },
  { href: '/provider/reviews', label: 'Reviews' },
  { href: '/provider/notifications', label: 'Notifications', badge: 'unread' },
  { href: '/provider/onboarding', label: 'Meri profile' },
  { href: '/provider/settings', label: 'Settings' },
];

export function ProviderSidebar({
  unread,
  pendingOffers,
  status,
}: {
  unread: number;
  pendingOffers: number;
  status: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-52 shrink-0 md:block">
      <nav aria-label="Provider" className="sticky top-24 space-y-1">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const count =
            link.badge === 'unread' ? unread : link.badge === 'offers' ? pendingOffers : 0;
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
              {count > 0 ? (
                <span className="rounded-full bg-alert-500 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
                  {count > 9 ? '9+' : count}
                </span>
              ) : null}
            </Link>
          );
        })}

        {status === 'VERIFIED' ? (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
            ✓ Aapki profile verified hai aur customers ko dikh rahi hai.
          </p>
        ) : null}
      </nav>
    </aside>
  );
}
