import { ok, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { getProviderEarnings } from '@/lib/analytics';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';

export const GET = route(async () => {
  const ctx = await requireProvider();
  const [earnings, payouts, commissionRateBp] = await Promise.all([
    getProviderEarnings(ctx.providerId),
    prisma.payout.findMany({
      where: { providerId: ctx.providerId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        grossPaisa: true,
        commissionPaisa: true,
        netPaisa: true,
        reference: true,
        processedAt: true,
      },
    }),
    getSetting('platform.commissionRateBp'),
  ]);

  return ok({ ...earnings, payouts, commissionRateBp });
});
