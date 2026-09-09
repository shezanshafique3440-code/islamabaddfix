import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { serviceWriteSchema } from '@/lib/validation/schemas';
import { deleteService, updateService } from '@/lib/catalogue';
import { rupeesToPaisa } from '@/lib/money';

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('catalogue:write');
  const { id } = await params;
  const input = await parseJson(request, serviceWriteSchema.partial());

  const service = await updateService(
    id,
    {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.minPriceRupees !== undefined
        ? { minPricePaisa: rupeesToPaisa(input.minPriceRupees) }
        : {}),
      ...(input.maxPriceRupees !== undefined
        ? { maxPricePaisa: input.maxPriceRupees == null ? null : rupeesToPaisa(input.maxPriceRupees) }
        : {}),
      ...(input.requiresInspection !== undefined
        ? { requiresInspection: input.requiresInspection }
        : {}),
      ...(input.estimatedMinutes !== undefined
        ? { estimatedMinutes: input.estimatedMinutes }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isEmergencyEnabled !== undefined
        ? { isEmergencyEnabled: input.isEmergencyEnabled }
        : {}),
      ...(input.guaranteeEligible !== undefined
        ? { guaranteeEligible: input.guaranteeEligible }
        : {}),
      ...(input.guaranteeDaysOverride !== undefined
        ? { guaranteeDaysOverride: input.guaranteeDaysOverride }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    { actorUserId: ctx.user.id, actorRole: ctx.role },
  );

  return ok(service);
});

export const DELETE = route(async (_request, { params }: Params) => {
  const ctx = await requirePermission('catalogue:write');
  const { id } = await params;
  await deleteService(id, { actorUserId: ctx.user.id, actorRole: ctx.role });
  return ok({ deleted: true, soft: true });
});
