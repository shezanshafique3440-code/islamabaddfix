import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import {
  getProviderOffers,
  getProviderSchedule,
  listBookingsFor,
  summarizeBooking,
} from '@/lib/bookings/queries';

const querySchema = z.object({
  view: z.enum(['today', 'offers', 'active', 'completed', 'all']).default('today'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  /** ISO date for the day view; defaults to today. */
  day: z.coerce.date().optional(),
});

export const GET = route(async (request) => {
  const ctx = await requireProvider();
  const query = parseQuery(request, querySchema);

  if (query.view === 'offers') {
    const offers = await getProviderOffers(ctx.providerId);
    return ok({ view: 'offers', offers });
  }

  if (query.view === 'today') {
    const [jobs, offers] = await Promise.all([
      getProviderSchedule(ctx.providerId, query.day ?? new Date()),
      getProviderOffers(ctx.providerId),
    ]);
    return ok({
      view: 'today',
      day: (query.day ?? new Date()).toISOString(),
      jobs: jobs.map(summarizeBooking),
      offers,
    });
  }

  const scope =
    query.view === 'completed' ? 'completed' : query.view === 'active' ? 'active' : 'all';
  const result = await listBookingsFor(ctx, {
    page: query.page,
    perPage: query.perPage,
    scope,
    search: query.search,
  });
  return ok(
    { view: query.view, jobs: result.items.map(summarizeBooking) },
    { pagination: result.pagination },
  );
});
