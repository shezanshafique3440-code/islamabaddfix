import type { Metadata } from 'next';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { MembershipPanel } from '@/components/account/MembershipPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeBenefits, listPublicPlans, membershipsFor } from '@/lib/memberships';
import { availablePaymentMethods } from '@/lib/payments';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = { title: 'Membership', robots: { index: false, follow: false } };

export default async function AccountMembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const ctx = await requirePageAuth('/account/membership');
  const { plan: preselected } = await searchParams;

  const [enabled, memberships, plans, methods] = await Promise.all([
    getSetting('memberships.enabled'),
    membershipsFor(ctx.user.id),
    listPublicPlans(),
    availablePaymentMethods(),
  ]);

  // The one that matters is the live one; the rest are history.
  const current =
    memberships.find((row) => row.status === 'ACTIVE' || row.status === 'PENDING_PAYMENT') ??
    memberships[0] ??
    null;

  // What the membership has actually saved, read from the benefit ledger rather
  // than recomputed — so the number on this page is the number on the receipts.
  const savings = current
    ? await prisma.membershipBenefit.aggregate({
        where: { membershipId: current.id },
        _sum: { amountPaisa: true },
      })
    : null;
  const bookingsUsed = current
    ? await prisma.booking.count({ where: { membershipId: current.id } })
    : 0;

  return (
    <div className="max-w-3xl">
      <h1 className="text-display-sm text-ink-950">Membership</h1>
      <p className="mt-1 text-sm text-ink-600">
        Lower prices on every completed booking, applied automatically.
      </p>

      <div className="mt-6">
        {!enabled && !current ? (
          <EmptyState
            title="Memberships are not open yet"
            description="We are not selling membership plans right now. Everything on the platform works exactly the same without one."
            action={{ label: 'Book a service', href: '/book' }}
          />
        ) : (
          <MembershipPanel
            membership={
              current
                ? {
                    id: current.id,
                    reference: current.reference,
                    status: current.status,
                    pricePaisa: current.pricePaisa,
                    startsAt: current.startsAt?.toISOString() ?? null,
                    endsAt: current.endsAt?.toISOString() ?? null,
                    planName: current.plan.name,
                    benefits: describeBenefits(current),
                    savedPaisa: savings?._sum.amountPaisa ?? 0,
                    bookingsUsed,
                  }
                : null
            }
            plans={plans.map((plan) => ({
              id: plan.id,
              code: plan.code,
              name: plan.name,
              tagline: plan.tagline,
              description: plan.description,
              pricePaisa: plan.pricePaisa,
              periodDays: plan.periodDays,
              benefits: describeBenefits(plan),
            }))}
            paymentMethods={methods.map((method) => ({
              value: method.method,
              label: method.label,
            }))}
            preselectedPlanCode={preselected}
          />
        )}
      </div>
    </div>
  );
}
