import { rateLimitIdentity, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { exportAccountData } from '@/lib/account';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

/**
 * Download everything the platform holds about the caller.
 *
 * Returned as a file rather than through the usual envelope: this is a
 * deliverable a person keeps, not an API response an app consumes.
 */
export const GET = route(async (request) => {
  const ctx = await requireAuth();
  await enforceRateLimit(RATE_LIMITS.dataExport, rateLimitIdentity(request, ctx.user.id));

  const data = await exportAccountData(ctx.user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="islamabad-fix-data-${stamp}.json"`,
      // Personal data: never cached by a proxy, never stored by the browser.
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
});
