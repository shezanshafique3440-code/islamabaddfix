'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

/**
 * Mobile navigation drawer.
 *
 * Closes on route change (otherwise it hangs over the new page) and locks page
 * scroll while open.
 */
export function MobileMenu({
  links,
  isSignedIn,
  dashboardHref,
  userName,
  unread,
}: {
  links: Array<{ href: string; label: string }>;
  isSignedIn: boolean;
  dashboardHref: string | null;
  userName: string | null;
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="ml-auto lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative rounded-lg p-2 text-ink-700 hover:bg-ink-100"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
        {isSignedIn && unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-alert-500" />
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 animate-fade-in">
          <button
            type="button"
            className="absolute inset-0 bg-scrim/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div
            className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] animate-slide-in-right flex-col bg-surface shadow-pop"
            role="dialog"
            aria-label="Navigation"
          >
            <div className="flex h-16 items-center justify-between border-b border-ink-200 px-4">
              <span className="text-sm font-semibold text-ink-900">
                {isSignedIn && userName ? userName : 'Menu'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
                aria-label="Close"
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7 6.3 5z" />
                </svg>
              </button>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto p-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'block rounded-xl px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                    pathname === link.href
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-ink-700 hover:bg-ink-100',
                  )}
                >
                  {link.label}
                </Link>
              ))}
              {isSignedIn && dashboardHref ? (
                <>
                  <hr className="my-3 border-ink-200" />
                  <Link
                    href={dashboardHref}
                    className="block rounded-xl px-3 py-3 text-[0.9375rem] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    My dashboard
                  </Link>
                  <Link
                    href={`${dashboardHref}/notifications`}
                    className="flex items-center justify-between rounded-xl px-3 py-3 text-[0.9375rem] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    Notifications
                    {unread > 0 ? (
                      <span className="rounded-full bg-alert-500 px-2 py-0.5 text-xs font-bold text-white">
                        {unread}
                      </span>
                    ) : null}
                  </Link>
                </>
              ) : null}
            </nav>

            <div className="space-y-2 border-t border-ink-200 p-4">
              <ThemeToggle className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-ink-300 text-[0.9375rem] font-medium text-ink-800 hover:bg-ink-50" />
              {isSignedIn ? (
                <LogoutButton />
              ) : (
                <>
                  <ButtonLink href="/book" fullWidth>
                    Book a service
                  </ButtonLink>
                  <ButtonLink href="/login" variant="outline" fullWidth>
                    Login
                  </ButtonLink>
                  <ButtonLink href="/provider-signup" variant="ghost" fullWidth>
                    Become a provider
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LogoutButton() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline"
      fullWidth
      loading={loading}
      onClick={async () => {
        setLoading(true);
        const { api } = await import('@/lib/client/api');
        try {
          await api.post('/api/auth/logout');
        } finally {
          // Full reload so every server component re-renders signed out.
          window.location.href = '/';
        }
      }}
    >
      Logout
    </Button>
  );
}
