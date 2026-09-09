import { ok, parseJson, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { providerLocationSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';

/**
 * Provider location ping.
 *
 * Refused unless the provider has explicitly turned on `shareLiveLocation`.
 * Consent is checked on write, not just on read, so nothing is recorded that
 * the provider did not agree to share in the first place.
 */
export const POST = route(async (request) => {
  const ctx = await requireProvider();
  const input = await parseJson(request, providerLocationSchema);

  const provider = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: ctx.providerId },
    select: { shareLiveLocation: true, status: true },
  });
  if (!provider.shareLiveLocation) {
    throw new AppError(
      'FORBIDDEN',
      'Location sharing off hai. Settings mein enable karein tab hi location record hogi.',
    );
  }

  await prisma.providerLocation.create({
    data: {
      providerId: ctx.providerId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyM: input.accuracyM ?? null,
    },
  });

  // Keep only a short trail: this is for dispatch, not for movement history.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.providerLocation.deleteMany({
    where: { providerId: ctx.providerId, recordedAt: { lt: cutoff } },
  });

  return ok({ recorded: true });
});

/** Turn sharing off and erase the trail in one call. */
export const DELETE = route(async () => {
  const ctx = await requireProvider();
  await prisma.$transaction([
    prisma.providerProfile.update({
      where: { id: ctx.providerId },
      data: { shareLiveLocation: false },
    }),
    prisma.providerLocation.deleteMany({ where: { providerId: ctx.providerId } }),
  ]);
  return ok({ sharingDisabled: true, historyCleared: true });
});
