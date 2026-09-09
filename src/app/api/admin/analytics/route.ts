import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import {
  getCategoryBreakdown,
  getDailySeries,
  getProviderPerformance,
  getRetentionMetrics,
  getZoneBreakdown,
} from '@/lib/analytics';

const querySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });

export const GET = route(async (request) => {
  await requirePermission('analytics:read');
  const { days } = parseQuery(request, querySchema);

  const [series, categories, zones, providers, retention] = await Promise.all([
    getDailySeries(days),
    getCategoryBreakdown(days),
    getZoneBreakdown(days),
    getProviderPerformance(20),
    getRetentionMetrics(),
  ]);

  return ok({ days, series, categories, zones, providers, retention });
});
