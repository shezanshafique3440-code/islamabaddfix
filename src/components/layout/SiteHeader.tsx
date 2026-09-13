import Link from 'next/link';
import { getAuthContext } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/rbac';
import { countUnread } from '@/lib/notifications';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from './Logo';
import { MobileMenu } from './MobileMenu';
import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/providers', label: 'Technicians' },
  { href: '/emergency', label: 'Emergency' },
  { href: '/how-it-works', label: 'How it works' },
];

/**
 * Public site header. A server component so the signed-in state is correct on
 * first paint — no flash of "Login" for someone who is already signed in.
 */
export async function SiteHeader() {
  const ctx = await getAuthContext();
  const unread = ctx ? await countUnread(ctx.user.id) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          {ctx ? (
            <>
              <Link
                href={`${homeForRole(ctx.role)}/notifications`}
                className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a6 6 0 0 0-6 6v3.6l-1.7 3.1A1 1 0 0 0 5.2 16h13.6a1 1 0 0 0 .9-1.3L18 11.6V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2H9.2a3 3 0 0 0 2.8 2Z" />
                </svg>
                {unread > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert-500 px-1 text-[0.625rem] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </Link>
              <ButtonLink href={homeForRole(ctx.role)} variant="outline" size="sm">
                {ctx.role === 'PROVIDER'
                  ? 'My dashboard'
                  : ctx.role === 'CUSTOMER'
                    ? 'My bookings'
                    : 'Admin'}
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Login
              </ButtonLink>
              <ButtonLink href="/book" size="sm">
                Book a service
              </ButtonLink>
            </>
          )}
        </div>

        <MobileMenu
          links={NAV_LINKS}
          isSignedIn={Boolean(ctx)}
          dashboardHref={ctx ? homeForRole(ctx.role) : null}
          userName={ctx?.user.fullName ?? null}
          unread={unread}
        />
      </div>
    </header>
  );
}
