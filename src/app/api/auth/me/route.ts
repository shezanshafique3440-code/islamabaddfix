import { ok, parseJson, route } from '@/lib/http';
import { getAuthContext, requireAuth } from '@/lib/auth/session';
import { updateProfileSchema } from '@/lib/validation/schemas';
import { normalizePhone } from '@/lib/auth/service';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { countUnread } from '@/lib/notifications';

export const GET = route(async () => {
  const ctx = await getAuthContext();
  if (!ctx) return ok({ user: null, unreadNotifications: 0 });
  return ok({
    user: ctx.user,
    providerId: ctx.providerId ?? null,
    providerStatus: ctx.providerStatus ?? null,
    unreadNotifications: await countUnread(ctx.user.id),
  });
});

export const PATCH = route(async (request) => {
  const ctx = await requireAuth();
  const input = await parseJson(request, updateProfileSchema);

  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  if (phone) {
    const clash = await prisma.user.findFirst({
      where: { phone, id: { not: ctx.user.id } },
      select: { id: true },
    });
    if (clash) throw new AppError('PHONE_TAKEN', 'Yeh phone number kisi aur account par hai.');
  }

  const user = await prisma.user.update({
    where: { id: ctx.user.id },
    data: {
      ...(input.fullName ? { fullName: input.fullName } : {}),
      // Changing the number invalidates the previous verification.
      ...(phone ? { phone, phoneVerifiedAt: null } : {}),
    },
    select: { id: true, fullName: true, email: true, phone: true, role: true },
  });

  return ok({ user });
});
