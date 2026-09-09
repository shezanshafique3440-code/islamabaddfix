import { created, ok, parseJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { categoryWriteSchema } from '@/lib/validation/schemas';
import { createCategory, getAdminCatalogue } from '@/lib/catalogue';

export const GET = route(async () => {
  await requirePermission('catalogue:write');
  return ok(await getAdminCatalogue());
});

export const POST = route(async (request) => {
  const ctx = await requirePermission('catalogue:write');
  const input = await parseJson(request, categoryWriteSchema);
  const category = await createCategory(input, {
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
  });
  return created(category);
});
