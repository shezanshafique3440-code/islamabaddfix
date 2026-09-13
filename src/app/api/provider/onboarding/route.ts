import { ok, parseJson, route } from '@/lib/http';
import { requireRole } from '@/lib/auth/session';
import { providerOnboardingSchema } from '@/lib/validation/schemas';
import { upsertProviderProfile } from '@/lib/providers/service';
import { getOwnProviderProfile } from '@/lib/providers/visibility';
import { rupeesToPaisa } from '@/lib/money';
import { listZones, getCatalogue } from '@/lib/catalogue';
import { getSetting } from '@/lib/settings';

/** Current submission plus the options needed to render the onboarding form. */
export const GET = route(async () => {
  const ctx = await requireRole('PROVIDER');
  const [profile, zones, categories, maxEmergencyFeePaisa] = await Promise.all([
    getOwnProviderProfile(ctx.user.id),
    listZones({ activeOnly: true }),
    getCatalogue(),
    getSetting('emergency.maxFeePaisa'),
  ]);
  return ok({ profile, zones, categories, limits: { maxEmergencyFeePaisa } });
});

/**
 * Submit or revise the provider profile.
 *
 * Never sets status: a provider cannot verify themselves. Prices arrive in
 * rupees and are converted to paisa here, at the boundary.
 */
export const PUT = route(async (request) => {
  const ctx = await requireRole('PROVIDER');
  const input = await parseJson(request, providerOnboardingSchema);

  const profile = await upsertProviderProfile({
    userId: ctx.user.id,
    businessName: input.businessName,
    contactPhone: input.contactPhone,
    headline: input.headline,
    description: input.description,
    yearsExperience: input.yearsExperience,
    addressLine: input.addressLine,
    sector: input.sector,
    services: input.services.map((service) => ({
      serviceId: service.serviceId,
      startingPricePaisa: rupeesToPaisa(service.startingPriceRupees),
    })),
    zoneIds: input.zoneIds,
    availability: input.availability,
    emergencyAvailable: input.emergencyAvailable,
    emergencyFeePaisa: input.emergencyFeeRupees
      ? rupeesToPaisa(input.emergencyFeeRupees)
      : undefined,
    serviceRadiusKm: input.serviceRadiusKm,
    cnicReference: input.cnicReference,
    bankAccountTitle: input.bankAccountTitle,
    bankName: input.bankName,
    bankIban: input.bankIban,
  });

  return ok({
    id: profile.id,
    slug: profile.slug,
    status: profile.status,
    message:
      profile.status === 'VERIFIED'
        ? 'Profile updated.'
        : 'Profile submitted. The team will review it and get back to you.',
  });
});
