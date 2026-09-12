import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { searchCatalogue } from '@/lib/catalogue';
import { listPublicProviders } from '@/lib/providers/visibility';

const querySchema = z.object({
  q: z.string().trim().min(2, 'Kam az kam 2 characters likhein.').max(120),
  include: z.enum(['all', 'catalogue', 'providers']).default('all'),
});

/**
 * Public search across the catalogue and the verified provider directory.
 * Bookings are searchable through the authenticated endpoints, not here.
 */
export const GET = route(async (request) => {
  const { q, include } = parseQuery(request, querySchema);

  const [catalogue, providers] = await Promise.all([
    include === 'providers'
      ? Promise.resolve({ categories: [], services: [] })
      : searchCatalogue(q),
    include === 'catalogue'
      ? Promise.resolve({ items: [], pagination: { page: 1, perPage: 0, total: 0, totalPages: 1 } })
      : listPublicProviders({ search: q, perPage: 6 }),
  ]);

  return ok({
    query: q,
    categories: catalogue.categories,
    services: catalogue.services,
    providers: providers.items,
  });
});
