import { ok, route } from '@/lib/http';
import { describeBenefits, listPublicPlans } from '@/lib/memberships';
import { getSetting } from '@/lib/settings';

export const GET = route(async () => {
  const [enabled, plans] = await Promise.all([
    getSetting('memberships.enabled'),
    listPublicPlans(),
  ]);
  return ok(
    plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      tagline: plan.tagline,
      description: plan.description,
      pricePaisa: plan.pricePaisa,
      periodDays: plan.periodDays,
      benefits: describeBenefits(plan),
    })),
    { enabled },
  );
});
