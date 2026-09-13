import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { MembershipManager } from '@/components/admin/MembershipManager';
import { listAllPlans } from '@/lib/memberships';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = { title: 'Memberships', robots: { index: false, follow: false } };

export default async function AdminMembershipsPage() {
  await requirePageRole(['ADMIN', 'SUPER_ADMIN'], '/admin/memberships');

  const [enabled, maxDiscountBp, maxFanoutBonus, plans, memberships] = await Promise.all([
    getSetting('memberships.enabled'),
    getSetting('memberships.maxDiscountBp'),
    getSetting('memberships.maxFanoutBonus'),
    listAllPlans(),
    prisma.membership.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        user: { select: { fullName: true, email: true } },
        plan: { select: { name: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { method: true } },
      },
    }),
  ]);

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Memberships</h1>
        <p className="mt-1 text-sm text-ink-600">
          Plans, and the memberships sold against them. A membership only starts once you confirm
          its payment.
        </p>
      </header>

      {!enabled ? (
        <p className="mt-5 rounded-xl bg-warn-50 px-4 py-3 text-sm leading-relaxed text-warn-700">
          Memberships are switched off, so no customer can see or buy a plan. Turn them on in{' '}
          <Link href="/admin/settings" className="font-semibold underline">
            platform settings
          </Link>{' '}
          once at least one plan is ready.
        </p>
      ) : null}

      <div className="mt-6">
        <MembershipManager
          limits={{ maxDiscountPercent: maxDiscountBp / 100, maxFanoutBonus }}
          plans={plans.map((plan) => ({
            id: plan.id,
            code: plan.code,
            name: plan.name,
            tagline: plan.tagline,
            description: plan.description,
            pricePaisa: plan.pricePaisa,
            periodDays: plan.periodDays,
            discountBp: plan.discountBp,
            maxDiscountPaisa: plan.maxDiscountPaisa,
            guaranteeBonusDays: plan.guaranteeBonusDays,
            priorityFanoutBonus: plan.priorityFanoutBonus,
            emergencyFeeWaiverPaisa: plan.emergencyFeeWaiverPaisa,
            isActive: plan.isActive,
            sortOrder: plan.sortOrder,
            memberCount: plan._count.memberships,
          }))}
          memberships={memberships.map((row) => ({
            id: row.id,
            reference: row.reference,
            status: row.status,
            planName: row.plan.name,
            customerName: row.user.fullName,
            customerEmail: row.user.email,
            pricePaisa: row.pricePaisa,
            createdAt: row.createdAt.toISOString(),
            endsAt: row.endsAt?.toISOString() ?? null,
            paymentMethod: row.payments[0]?.method ?? null,
          }))}
        />
      </div>
    </div>
  );
}
