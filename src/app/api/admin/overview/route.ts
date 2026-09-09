import { ok, route } from '@/lib/http';
import { requirePermission } from '@/lib/auth/session';
import { getOverviewMetrics } from '@/lib/analytics';
import { channelStatus } from '@/lib/notifications';
import { paymentProviderStatus } from '@/lib/payments';
import { aiStatus } from '@/lib/ai';
import { mapsStatus } from '@/lib/maps';
import { integrations } from '@/lib/env';

export const GET = route(async () => {
  await requirePermission('analytics:read');
  const metrics = await getOverviewMetrics();

  return ok({
    metrics,
    // Surfacing configuration state here is what lets the dashboard show
    // "not configured" honestly instead of empty charts.
    integrations: {
      notifications: channelStatus(),
      payments: paymentProviderStatus(),
      ai: aiStatus(),
      maps: mapsStatus(),
      whatsapp: integrations.whatsapp,
      voice: integrations.voice,
      storage: integrations.storage,
    },
  });
});
