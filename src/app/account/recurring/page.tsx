import type { Metadata } from 'next';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { RecurringManager } from '@/components/account/RecurringManager';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeSchedule, schedulesFor } from '@/lib/bookings/recurring';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Repeat visits',
  robots: { index: false, follow: false },
};

export default async function RecurringPage() {
  const ctx = await requirePageAuth('/account/recurring');

  const [enabled, leadDays, schedules, services, addresses] = await Promise.all([
    getSetting('recurring.enabled'),
    getSetting('recurring.leadDays'),
    schedulesFor(ctx.user.id),
    prisma.service.findMany({
      where: { isActive: true, deletedAt: null, category: { isActive: true, deletedAt: null } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
    prisma.address.findMany({
      where: { userId: ctx.user.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, addressLine: true },
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-display-sm text-ink-950">Repeat visits</h1>
      <p className="mt-1 text-sm text-ink-600">
        For work that comes round again. We book it for you; you approve the quote each time.
      </p>

      <div className="mt-6">
        {!enabled ? (
          <EmptyState
            title="Repeat visits are switched off"
            description="We are not taking standing arrangements right now. Book each visit as you need it."
            action={{ label: 'Book a service', href: '/book' }}
          />
        ) : addresses.length === 0 ? (
          <EmptyState
            title="Add an address first"
            description="A repeat visit needs somewhere to go. Save an address and come back."
            action={{ label: 'Add an address', href: '/account/addresses' }}
          />
        ) : (
          <RecurringManager
            options={{
              leadDays,
              services: services.map((service) => ({
                id: service.id,
                name: service.name,
                categoryName: service.category.name,
              })),
              addresses,
            }}
            schedules={schedules.map((schedule) => ({
              id: schedule.id,
              reference: schedule.reference,
              status: schedule.status as 'ACTIVE' | 'PAUSED' | 'ENDED',
              serviceName: schedule.service.name,
              addressLabel: schedule.address.label,
              providerName: schedule.provider?.businessName ?? null,
              summary: describeSchedule(schedule),
              nextOccurrenceAt: schedule.nextOccurrenceAt.toISOString(),
              bookingsCreated: schedule._count.bookings,
            }))}
          />
        )}
      </div>
    </div>
  );
}
