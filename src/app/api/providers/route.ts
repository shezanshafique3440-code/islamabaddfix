import { ok, parseQuery, route } from '@/lib/http';
import { providerListQuerySchema } from '@/lib/validation/schemas';
import { listPublicProviders } from '@/lib/providers/visibility';

/** Public directory. Only VERIFIED providers are ever returned. */
export const GET = route(async (request) => {
  const query = parseQuery(request, providerListQuerySchema);
  const result = await listPublicProviders(query);
  return ok(result.items, { pagination: result.pagination });
});
