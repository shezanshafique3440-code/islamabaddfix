import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { getBookingDetailFor } from '@/lib/bookings/queries';
import { getSetting } from '@/lib/settings';
import { ProviderJobView } from '@/components/provider/ProviderJobView';

export const metadata: Metadata = { title: 'Job detail', robots: { index: false, follow: false } };

type Params = { params: Promise<{ id: string }> };

export default async function ProviderJobPage({ params }: Params) {
  const ctx = await requirePageRole(['PROVIDER'], '/provider/jobs');
  if (!ctx.providerId) redirect('/provider/onboarding');

  const { id } = await params;
  const booking = await getBookingDetailFor(id, ctx);
  const commissionRateBp = await getSetting('platform.commissionRateBp');

  return (
    <ProviderJobView
      booking={booking}
      commissionRateBp={commissionRateBp}
      isAssigned={booking.provider?.id === ctx.providerId}
    />
  );
}
