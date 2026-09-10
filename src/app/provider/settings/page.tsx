import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { ProviderSettingsForm } from '@/components/provider/ProviderSettingsForm';

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } };

export default async function ProviderSettingsPage() {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/settings');
  if (!ctx.providerId) redirect('/provider/onboarding');

  const [provider, maxEmergencyFeePaisa, locationCount] = await Promise.all([
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: ctx.providerId },
      select: {
        shareLiveLocation: true,
        maxActiveJobs: true,
        emergencyAvailable: true,
        emergencyFeePaisa: true,
        serviceRadiusKm: true,
      },
    }),
    getSetting('emergency.maxFeePaisa'),
    prisma.providerLocation.count({ where: { providerId: ctx.providerId } }),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-display-sm text-ink-950">Settings</h1>
      <p className="mt-1 text-sm text-ink-600">Availability, capacity aur privacy controls.</p>
      <div className="mt-6">
        <ProviderSettingsForm
          initial={{
            shareLiveLocation: provider.shareLiveLocation,
            maxActiveJobs: provider.maxActiveJobs,
            emergencyAvailable: provider.emergencyAvailable,
            emergencyFeeRupees: provider.emergencyFeePaisa / 100,
            serviceRadiusKm: provider.serviceRadiusKm,
          }}
          maxEmergencyFeePaisa={maxEmergencyFeePaisa}
          storedLocationCount={locationCount}
        />
      </div>
    </div>
  );
}
