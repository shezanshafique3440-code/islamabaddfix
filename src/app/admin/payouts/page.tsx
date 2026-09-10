import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { PayoutManager } from '@/components/admin/PayoutManager';
import { formatPaisa } from '@/lib/money';

export const metadata: Metadata = { title: 'Payouts', robots: { index: false, follow: false } };

export default async function AdminPayoutsPage() {
  await requirePermission('payout:manage');

  const [payouts, owing] = await Promise.all([
    prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        provider: {
          select: { id: true, businessName: true, bankName: true, bankAccountLast4: true },
        },
        _count: { select: { items: true } },
      },
    }),
    // Completed jobs whose earnings are not yet in any payout.
    prisma.booking.groupBy({
      by: ['providerId'],
      where: { status: 'COMPLETED', payoutItems: { none: {} }, providerId: { not: null } },
      _sum: { providerEarningsPaisa: true },
      _count: { _all: true },
      _min: { completedAt: true },
      _max: { completedAt: true },
    }),
  ]);

  const providers = await prisma.providerProfile.findMany({
    where: { id: { in: owing.map((row) => row.providerId!).filter(Boolean) } },
    select: { id: true, businessName: true, bankName: true, bankAccountLast4: true },
  });
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Payouts</h1>
        <p className="mt-1 text-sm text-ink-600">
          Bank transfer is system se bahar hota hai — yahan record rakha jata hai ke kis ko kitna
          bheja gaya.
        </p>
      </header>

      <div className="mt-6">
        <PayoutManager
          pending={owing
            .filter((row) => row.providerId !== null)
            .map((row) => {
              const provider = providerById.get(row.providerId!);
              return {
                providerId: row.providerId!,
                businessName: provider?.businessName ?? 'Unknown',
                bankLabel: provider?.bankAccountLast4
                  ? `${provider.bankName ?? 'Bank'} •••• ${provider.bankAccountLast4}`
                  : 'Payout account set nahi',
                jobs: row._count._all,
                earningsPaisa: row._sum.providerEarningsPaisa ?? 0,
                earliest: row._min.completedAt?.toISOString() ?? null,
                latest: row._max.completedAt?.toISOString() ?? null,
              };
            })
            .sort((a, b) => b.earningsPaisa - a.earningsPaisa)}
          payouts={payouts.map((payout) => ({
            id: payout.id,
            status: payout.status,
            providerName: payout.provider.businessName,
            bankLabel: payout.provider.bankAccountLast4
              ? `${payout.provider.bankName ?? 'Bank'} •••• ${payout.provider.bankAccountLast4}`
              : 'Payout account set nahi',
            periodStart: payout.periodStart.toISOString(),
            periodEnd: payout.periodEnd.toISOString(),
            grossPaisa: payout.grossPaisa,
            commissionPaisa: payout.commissionPaisa,
            netPaisa: payout.netPaisa,
            reference: payout.reference,
            itemCount: payout._count.items,
            processedAt: payout.processedAt?.toISOString() ?? null,
          }))}
          totalPendingPaisa={owing.reduce(
            (sum, row) => sum + (row._sum.providerEarningsPaisa ?? 0),
            0,
          )}
        />
      </div>

      <p className="mt-6 text-xs text-ink-500">
        Note: cash bookings mein paise seedhe provider ko customer se milte hain. Payout record
        commission reconciliation aur bank transfers ke liye hai.{' '}
        {owing.length > 0
          ? `Filhaal ${formatPaisa(
              owing.reduce((sum, row) => sum + (row._sum.providerEarningsPaisa ?? 0), 0),
            )} kisi payout mein shamil nahi.`
          : ''}
      </p>
    </div>
  );
}
