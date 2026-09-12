import { created, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { serviceWriteSchema } from '@/lib/validation/schemas';
import { createService } from '@/lib/catalogue';
import { rupeesToPaisa } from '@/lib/money';

export const POST = route(async (request) => {
  const ctx = await requirePermission('catalogue:write');
  const input = await parseJson(request, serviceWriteSchema);

  const service = await createService(
    {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      minPricePaisa:
        input.minPriceRupees !== undefined ? rupeesToPaisa(input.minPriceRupees) : undefined,
      maxPricePaisa: input.maxPriceRupees != null ? rupeesToPaisa(input.maxPriceRupees) : null,
      requiresInspection: input.requiresInspection,
      estimatedMinutes: input.estimatedMinutes,
      isActive: input.isActive,
      isEmergencyEnabled: input.isEmergencyEnabled,
      guaranteeEligible: input.guaranteeEligible,
      guaranteeDaysOverride: input.guaranteeDaysOverride,
      sortOrder: input.sortOrder,
    },
    { actorUserId: ctx.user.id, actorRole: ctx.role },
  );

  return created(service);
});
