import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { integrations } from '@/lib/env';

/**
 * Liveness/readiness probe. Reports database reachability and which optional
 * integrations are configured — useful right after a deploy to confirm the
 * environment landed as intended.
 */
export async function GET() {
  const started = Date.now();
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }

  return NextResponse.json(
    {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      latencyMs: Date.now() - started,
      integrations: {
        ai: integrations.ai.configured,
        maps: integrations.maps.configured,
        email: integrations.email.configured,
        sms: integrations.sms.configured,
        whatsapp: integrations.whatsapp.configured,
        voice: integrations.voice.configured,
        onlinePayments: integrations.onlinePayments.configured,
        storage: integrations.storage.driver,
      },
    },
    { status: database === 'up' ? 200 : 503 },
  );
}
