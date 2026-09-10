import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getAuthContext } from '@/lib/auth/session';
import { getCatalogue, listZones } from '@/lib/catalogue';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { aiStatus } from '@/lib/ai';
import { mapsStatus } from '@/lib/maps';
import { availablePaymentMethods } from '@/lib/payments';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { SkeletonCard } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Service book karein',
  description: 'Apna masla batayein, technician chunein aur booking confirm karein.',
  robots: { index: false, follow: true },
};

interface SearchParams {
  problem?: string;
  category?: string;
  service?: string;
  provider?: string;
  zone?: string;
  emergency?: string;
  via?: string;
}

/**
 * Booking wizard host.
 *
 * All the reference data the wizard needs is fetched here on the server in one
 * pass, so the first step renders immediately instead of waterfalling three
 * client requests on a slow connection.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const ctx = await getAuthContext();

  const [catalogue, zones, addresses, paymentMethods, limits, emergencyEnabled] = await Promise.all(
    [
      getCatalogue(),
      listZones({ activeOnly: true }),
      ctx
        ? prisma.address.findMany({
            where: { userId: ctx.user.id, deletedAt: null },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
            include: { zone: { select: { id: true, name: true, slug: true } } },
          })
        : Promise.resolve([]),
      availablePaymentMethods(),
      Promise.all([
        getSetting('booking.minLeadMinutes'),
        getSetting('booking.maxLeadDays'),
        getSetting('guarantee.days'),
        getSetting('emergency.defaultFeePaisa'),
      ]),
      getSetting('emergency.enabled'),
    ],
  );

  const [minLeadMinutes, maxLeadDays, guaranteeDays, defaultEmergencyFeePaisa] = limits;

  // Resolve any prefill from the query string (deep links from the home page,
  // service pages, WhatsApp and the voice agent all arrive this way).
  const preselectedService = query.service
    ? (catalogue
        .flatMap((category) =>
          category.services.map((service) => ({ ...service, categorySlug: category.slug })),
        )
        .find((service) => service.slug === query.service) ?? null)
    : null;

  const preselectedProvider = query.provider
    ? await prisma.providerProfile.findFirst({
        where: { slug: query.provider, status: 'VERIFIED', deletedAt: null },
        select: { id: true, slug: true, businessName: true },
      })
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 bg-ink-50/40">
        <Suspense fallback={<div className="mx-auto max-w-3xl p-6"><SkeletonCard /></div>}>
          <BookingWizard
            isSignedIn={Boolean(ctx)}
            catalogue={catalogue}
            zones={zones.map((zone) => ({
              id: zone.id,
              name: zone.name,
              slug: zone.slug,
              latitude: zone.latitude,
              longitude: zone.longitude,
            }))}
            addresses={addresses.map((address) => ({
              id: address.id,
              label: address.label,
              addressLine: address.addressLine,
              houseOrBuilding: address.houseOrBuilding,
              zoneId: address.zoneId,
              zoneName: address.zone?.name ?? null,
              city: address.city,
              isDefault: address.isDefault,
            }))}
            paymentMethods={paymentMethods}
            prefill={{
              problem: query.problem ?? null,
              categorySlug: query.category ?? preselectedService?.categorySlug ?? null,
              serviceId: preselectedService?.id ?? null,
              providerId: preselectedProvider?.id ?? null,
              providerName: preselectedProvider?.businessName ?? null,
              zoneSlug: query.zone ?? null,
              isEmergency: query.emergency === '1' && emergencyEnabled,
              via: query.via ?? null,
            }}
            config={{
              minLeadMinutes,
              maxLeadDays,
              guaranteeDays,
              defaultEmergencyFeePaisa,
              emergencyEnabled,
              aiConfigured: aiStatus().configured,
              mapsConfigured: mapsStatus().configured,
            }}
          />
        </Suspense>
      </main>
    </div>
  );
}
