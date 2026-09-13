import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ok, route } from '@/lib/http';
import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';
import { generateDueBookings } from '@/lib/bookings/recurring';
import { expireLapsedMemberships } from '@/lib/memberships';

/**
 * Scheduled work: generate due repeat visits and retire lapsed memberships.
 *
 * Called by whatever scheduler the deployment uses (a platform cron, a systemd
 * timer, a CI job) with `Authorization: Bearer $CRON_SECRET`. With no secret
 * configured the endpoint refuses everyone — an unauthenticated job runner that
 * can create bookings is worse than no job runner at all.
 *
 * Everything it calls is idempotent, so a scheduler that fires twice, or late,
 * or after a missed window, produces the same result as one that fires once.
 */
export const POST = route(async (request) => {
  const expected = env.CRON_SECRET;
  if (!expected) {
    throw new AppError(
      'INTEGRATION_NOT_CONFIGURED',
      'CRON_SECRET is not set, so scheduled jobs are disabled on this deployment.',
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!constantTimeEquals(presented, expected)) {
    throw new AppError('UNAUTHENTICATED', 'Invalid cron credentials.');
  }

  const recurring = await generateDueBookings();
  const membershipsExpired = await expireLapsedMemberships();

  await recordAudit({
    action: AUDIT_ACTIONS.RECURRING_RUN,
    entity: 'RecurringSchedule',
    metadata: { ...recurring, membershipsExpired },
  });

  return ok({ recurring, membershipsExpired });
});

/** Rejects a wrong-length secret without leaking the length through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Compare against itself so the work done is independent of the input.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function GET(): NextResponse {
  return NextResponse.json(
    { success: false, message: 'Use POST.', code: 'VALIDATION_ERROR' },
    { status: 405 },
  );
}
