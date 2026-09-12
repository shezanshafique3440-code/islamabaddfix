import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { getBookingDetailFor } from '@/lib/bookings/queries';
import { getSetting, getSettings } from '@/lib/settings';
import { reschedulesRemaining } from '@/lib/bookings/reschedule';
import { ProviderJobView } from '@/components/provider/ProviderJobView';

export const metadata: Metadata = { title: 'Job detail', robots: { index: false, follow: false } };

type Params = { params: Promise<{ id: string }> };

export default async function ProviderJobPage({ params }: Params) {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/jobs');
  if (!ctx.providerId) redirect('/provider/onboarding');

  const { id } = await params;
  const booking = await getBookingDetailFor(id, ctx);
  const [commissionRateBp, [minLeadMinutes, maxLeadDays], remaining] = await Promise.all([
    getSetting('platform.commissionRateBp'),
    getSettings(['booking.minLeadMinutes', 'booking.maxLeadDays']),
    reschedulesRemaining(id),
  ]);

  const isAssigned = booking.provider?.id === ctx.providerId;
  const canReschedule =
    isAssigned &&
    !booking.isEmergency &&
    ['ACCEPTED', 'QUOTE_PENDING', 'QUOTE_APPROVED', 'SCHEDULED'].includes(booking.status);

  return (
    <ProviderJobView
      booking={booking}
      commissionRateBp={commissionRateBp}
      isAssigned={isAssigned}
      reschedule={canReschedule ? { remaining, minLeadMinutes, maxLeadDays } : null}
    />
  );
}
