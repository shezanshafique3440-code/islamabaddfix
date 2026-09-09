import { ok, parseJson, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { providerSettingsSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { rupeesToPaisa } from '@/lib/money';
import { getSetting } from '@/lib/settings';
import { AppError } from '@/lib/errors';

export const GET = route(async () => {
  const ctx = await requireProvider();
  const [provider, maxEmergencyFeePaisa] = await Promise.all([
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: ctx.providerId },
      select: {
        shareLiveLocation: true,
        maxActiveJobs: true,
        emergencyAvailable: true,
        emergencyFeePaisa: true,
        serviceRadiusKm: true,
        status: true,
      },
    }),
    getSetting('emergency.maxFeePaisa'),
  ]);
  return ok({ ...provider, limits: { maxEmergencyFeePaisa } });
});

export const PATCH = route(async (request) => {
  const ctx = await requireProvider();
  const input = await parseJson(request, providerSettingsSchema);

  const emergencyFeePaisa =
    input.emergencyFeeRupees !== undefined ? rupeesToPaisa(input.emergencyFeeRupees) : undefined;
  if (emergencyFeePaisa !== undefined) {
    const cap = await getSetting('emergency.maxFeePaisa');
    if (emergencyFeePaisa > cap) {
      throw new AppError('VALIDATION_ERROR', 'Emergency fee platform limit se zyada hai.');
    }
  }

  const provider = await prisma.providerProfile.update({
    where: { id: ctx.providerId },
    data: {
      ...(input.shareLiveLocation !== undefined
        ? { shareLiveLocation: input.shareLiveLocation }
        : {}),
      ...(input.maxActiveJobs !== undefined ? { maxActiveJobs: input.maxActiveJobs } : {}),
      ...(input.emergencyAvailable !== undefined
        ? { emergencyAvailable: input.emergencyAvailable }
        : {}),
      ...(emergencyFeePaisa !== undefined ? { emergencyFeePaisa } : {}),
      ...(input.serviceRadiusKm !== undefined ? { serviceRadiusKm: input.serviceRadiusKm } : {}),
    },
    select: {
      shareLiveLocation: true,
      maxActiveJobs: true,
      emergencyAvailable: true,
      emergencyFeePaisa: true,
      serviceRadiusKm: true,
    },
  });

  // Turning sharing off must also clear what was already recorded.
  if (input.shareLiveLocation === false) {
    await prisma.providerLocation.deleteMany({ where: { providerId: ctx.providerId } });
  }

  return ok(provider);
});
