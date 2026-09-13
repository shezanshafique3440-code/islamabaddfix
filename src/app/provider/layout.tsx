import { requirePageRole } from '@/lib/auth/session';
import { countUnread } from '@/lib/notifications';
import { prisma } from '@/lib/db';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { BottomNav, NavIcons } from '@/components/layout/BottomNav';
import { ProviderSidebar } from '@/components/provider/ProviderSidebar';
import { ProviderStatusBanner } from '@/components/provider/ProviderStatusBanner';

/**
 * Provider dashboard shell.
 *
 * A provider without a profile is sent to onboarding; one whose profile is not
 * yet VERIFIED sees the dashboard with a banner explaining what that means, so
 * the state is never a mystery.
 */
export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRole(['PROVIDER'], '/provider');

  const profile = ctx.providerId
    ? await prisma.providerProfile.findUnique({
        where: { id: ctx.providerId },
        select: {
          status: true,
          businessName: true,
          rejectedReason: true,
          suspendedReason: true,
          _count: { select: { services: true, serviceAreas: true } },
        },
      })
    : null;

  const [unread, pendingOffers] = await Promise.all([
    countUnread(ctx.user.id),
    ctx.providerId
      ? prisma.bookingOffer.count({
          where: {
            providerId: ctx.providerId,
            respondedAt: null,
            booking: { status: { in: ['PENDING', 'PROVIDER_NOTIFIED'] }, deletedAt: null },
          },
        })
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-content flex-1 gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <ProviderSidebar
          unread={unread}
          pendingOffers={pendingOffers}
          status={profile?.status ?? null}
        />
        <main id="main" className="min-w-0 flex-1 pb-20 md:pb-0">
          {profile ? (
            <ProviderStatusBanner
              status={profile.status}
              businessName={profile.businessName}
              rejectedReason={profile.rejectedReason}
              suspendedReason={profile.suspendedReason}
              servicesCount={profile._count.services}
              areasCount={profile._count.serviceAreas}
            />
          ) : null}
          {children}
        </main>
      </div>
      <BottomNav
        items={[
          { href: '/provider', label: 'Today', icon: NavIcons.home },
          { href: '/provider/jobs', label: 'Jobs', icon: NavIcons.jobs, match: '/provider/jobs' },
          { href: '/provider/earnings', label: 'Earnings', icon: NavIcons.earnings },
          { href: '/provider/notifications', label: 'Alerts', icon: NavIcons.bell },
        ]}
        badge={{ '/provider/notifications': unread, '/provider/jobs': pendingOffers }}
      />
    </div>
  );
}
