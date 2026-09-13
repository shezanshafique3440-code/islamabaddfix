import type { Metadata } from 'next';
import { requirePageRole } from '@/lib/auth/session';
import { getOwnProviderProfile } from '@/lib/providers/visibility';
import { getCatalogue, listZones } from '@/lib/catalogue';
import { getSetting } from '@/lib/settings';
import { ProviderOnboardingForm } from '@/components/provider/ProviderOnboardingForm';

export const metadata: Metadata = {
  title: 'My profile',
  robots: { index: false, follow: false },
};

export default async function ProviderOnboardingPage() {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/onboarding');

  const [profile, catalogue, zones, maxEmergencyFeePaisa, requireCnic] = await Promise.all([
    getOwnProviderProfile(ctx.user.id),
    getCatalogue(),
    listZones({ activeOnly: true }),
    getSetting('emergency.maxFeePaisa'),
    getSetting('providers.requireCnicForVerification'),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-display-sm text-ink-950">
        {profile ? 'My profile' : 'Complete your profile'}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        {profile
          ? 'Update your services, areas, rates and working hours here.'
          : 'This information is shown to customers and used in matching.'}
      </p>

      <div className="mt-6">
        <ProviderOnboardingForm
          profile={
            profile
              ? {
                  businessName: profile.businessName,
                  contactPhone: profile.contactPhone,
                  headline: profile.headline,
                  description: profile.description,
                  yearsExperience: profile.yearsExperience,
                  addressLine: profile.addressLine,
                  sector: profile.sector,
                  status: profile.status,
                  emergencyAvailable: profile.emergencyAvailable,
                  emergencyFeePaisa: profile.emergencyFeePaisa,
                  serviceRadiusKm: profile.serviceRadiusKm,
                  photoUrl: profile.photoUrl,
                  bankAccountTitle: profile.bankAccountTitle,
                  bankName: profile.bankName,
                  bankIbanMasked: profile.bankIbanMasked,
                  services: profile.services.map((entry) => ({
                    serviceId: entry.serviceId,
                    startingPricePaisa: entry.startingPricePaisa,
                  })),
                  zoneIds: profile.serviceAreas.map((area) => area.zoneId),
                  availability: profile.availability.map((window) => ({
                    dayOfWeek: window.dayOfWeek,
                    startMinute: window.startMinute,
                    endMinute: window.endMinute,
                  })),
                  verifications: profile.verifications.map((verification) => ({
                    kind: verification.kind,
                    status: verification.status,
                    reference: verification.reference,
                  })),
                  documents: profile.documents.map((document) => ({
                    id: document.id,
                    name: document.originalName,
                  })),
                }
              : null
          }
          catalogue={catalogue.map((category) => ({
            slug: category.slug,
            name: category.name,
            iconKey: category.iconKey,
            services: category.services.map((service) => ({
              id: service.id,
              name: service.name,
              minPricePaisa: service.minPricePaisa,
            })),
          }))}
          zones={zones.map((zone) => ({ id: zone.id, name: zone.name }))}
          limits={{ maxEmergencyFeePaisa, requireCnic }}
        />
      </div>
    </div>
  );
}
