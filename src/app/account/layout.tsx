import { requirePageRole } from '@/lib/auth/session';
import { countUnread } from '@/lib/notifications';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { BottomNav, NavIcons } from '@/components/layout/BottomNav';
import { AccountSidebar } from '@/components/account/AccountSidebar';

/**
 * Customer dashboard shell.
 *
 * Role is enforced here for every nested page, and again inside each API call —
 * a layout guard alone would not stop a direct request.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRole(['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'], '/account');
  const unread = await countUnread(ctx.user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-content flex-1 gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <AccountSidebar unread={unread} />
        <main id="main" className="min-w-0 flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav
        items={[
          { href: '/account', label: 'Bookings', icon: NavIcons.bookings, match: '/account/bookings' },
          { href: '/book', label: 'Naya', icon: NavIcons.search },
          { href: '/account/notifications', label: 'Alerts', icon: NavIcons.bell },
          { href: '/account/profile', label: 'Profile', icon: NavIcons.profile },
        ]}
        badge={{ '/account/notifications': unread }}
      />
    </div>
  );
}
