import { ok, parseJson, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { changePasswordSchema } from '@/lib/validation/schemas';
import { changePassword } from '@/lib/auth/service';
import { clearAuthCookies } from '@/lib/auth/cookies';

export const POST = route(async (request) => {
  const ctx = await requireAuth();
  const input = await parseJson(request, changePasswordSchema);
  await changePassword(ctx.user.id, input.currentPassword, input.newPassword);
  // Every session was revoked, including this one — force a fresh login.
  await clearAuthCookies();
  return ok({ changed: true, reloginRequired: true });
});
