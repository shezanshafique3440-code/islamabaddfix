import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { getAdminCatalogue } from '@/lib/catalogue';
import { CatalogueManager } from '@/components/admin/CatalogueManager';

export const metadata: Metadata = {
  title: 'Categories & services',
  robots: { index: false, follow: false },
};

export default async function AdminCataloguePage() {
  await requirePermission('catalogue:write');
  const catalogue = await getAdminCatalogue();

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Categories &amp; services</h1>
        <p className="mt-1 text-sm text-ink-600">
          Catalogue yahan se manage hota hai — code mein koi category hard-coded nahi.
        </p>
      </header>

      <div className="mt-6">
        <CatalogueManager
          categories={catalogue.map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            tagline: category.tagline,
            iconKey: category.iconKey,
            isActive: category.isActive,
            isEmergencyCategory: category.isEmergencyCategory,
            guaranteeEligible: category.guaranteeEligible,
            sortOrder: category.sortOrder,
            services: category.services.map((service) => ({
              id: service.id,
              name: service.name,
              slug: service.slug,
              description: service.description,
              minPricePaisa: service.minPricePaisa,
              maxPricePaisa: service.maxPricePaisa,
              requiresInspection: service.requiresInspection,
              estimatedMinutes: service.estimatedMinutes,
              isActive: service.isActive,
              isEmergencyEnabled: service.isEmergencyEnabled,
              guaranteeEligible: service.guaranteeEligible,
              bookingCount: service._count.bookings,
              providerCount: service._count.providerServices,
            })),
          }))}
        />
      </div>
    </div>
  );
}
