'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Mobile bottom navigation for signed-in users.
 *
 * The customer flow is thumb-driven on a phone, so the primary destinations sit
 * within reach. Hidden on desktop, where the header carries them.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Also active for nested routes under this path. */
  match?: string;
}

export function BottomNav({ items, badge }: { items: NavItem[]; badge?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = item.match
            ? pathname === item.match || pathname.startsWith(`${item.match}/`)
            : pathname === item.href;
          const count = badge?.[item.href] ?? 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium transition-colors',
                  active ? 'text-brand-700' : 'text-ink-500',
                )}
              >
                <span className="relative">
                  {item.icon}
                  {count > 0 ? (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert-500 px-1 text-[0.625rem] font-bold text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Icon set used by the bottom bars. 24px stroked, consistent weight. */
export const NavIcons = {
  home: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  bookings: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M8 3v3M16 3v3M3.5 9.5h17M8 13h3M8 16.5h6" strokeLinecap="round" />
    </svg>
  ),
  jobs: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" />
      <path d="M3 12h18" />
    </svg>
  ),
  search: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" strokeLinecap="round" />
    </svg>
  ),
  earnings: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" />
    </svg>
  ),
  bell: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path
        d="M6.5 9a5.5 5.5 0 0 1 11 0v3.4l1.4 2.6a.8.8 0 0 1-.7 1.2H5.8a.8.8 0 0 1-.7-1.2l1.4-2.6V9Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
    </svg>
  ),
  profile: (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.375rem] w-[1.375rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  ),
} as const;
