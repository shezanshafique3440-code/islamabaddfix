import { requirePageRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

/**
 * Admin shell.
 *
 * Optimised for desktop and tablet, as the brief specifies — ops work happens
 * at a desk. Queue counts sit in the nav so nothing waits unnoticed.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageRole(['ADMIN', 'SUPER_ADMIN'], '/admin');

  const [pendingProviders, openDisputes, openClaims, openTickets, unassigned, pendingMemberships] =
    await Promise.all([
      prisma.providerProfile.count({ where: { status: 'PENDING_VERIFICATION', deletedAt: null } }),
      prisma.dispute.count({
        where: {
          status: { in: ['OPEN', 'UNDER_REVIEW', 'AWAITING_CUSTOMER', 'AWAITING_PROVIDER'] },
        },
      }),
      prisma.guaranteeClaim.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REVISIT_SCHEDULED'] } },
      }),
      prisma.supportTicket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] } },
      }),
      prisma.booking.count({ where: { status: 'PENDING', providerId: null, deletedAt: null } }),
      prisma.membership.count({ where: { status: 'PENDING_PAYMENT' } }),
    ]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-[90rem] flex-1 gap-6 px-4 py-6 sm:px-6">
        <AdminSidebar
          role={ctx.role}
          counts={{
            providers: pendingProviders,
            disputes: openDisputes,
            guarantees: openClaims,
            support: openTickets,
            bookings: unassigned,
            memberships: pendingMemberships,
          }}
        />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
