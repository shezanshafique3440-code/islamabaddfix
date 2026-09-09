import { ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { categoryWriteSchema } from '@/lib/validation/schemas';
import { deleteCategory, updateCategory } from '@/lib/catalogue';

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request, { params }: Params) => {
  const ctx = await requirePermission('catalogue:write');
  const { id } = await params;
  const input = await parseJson(request, categoryWriteSchema.partial());
  const category = await updateCategory(id, input, {
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
  });
  return ok(category);
});

/** Soft delete; refuses while the category has live bookings. */
export const DELETE = route(async (_request, { params }: Params) => {
  const ctx = await requirePermission('catalogue:write');
  const { id } = await params;
  await deleteCategory(id, { actorUserId: ctx.user.id, actorRole: ctx.role });
  return ok({ deleted: true, soft: true });
});
