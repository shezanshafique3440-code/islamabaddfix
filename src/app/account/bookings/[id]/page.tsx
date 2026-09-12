import type { Metadata } from 'next';
import { requirePageRole } from '@/lib/auth/session';
import { getBookingDetailFor } from '@/lib/bookings/queries';
import { availablePaymentMethods } from '@/lib/payments';
import { getSetting, getSettings } from '@/lib/settings';
import { reschedulesRemaining } from '@/lib/bookings/reschedule';
import { BookingDetailView } from '@/components/account/BookingDetailView';

export const metadata: Metadata = {
  title: 'Booking detail',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function BookingDetailPage({ params }: Params) {
  const ctx = await requirePageRole(['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'], '/account');
  const { id } = await params;

  // getBookingDetailFor throws NOT_FOUND for a booking the viewer is not party
  // to, which Next renders through the nearest error boundary.
  const booking = await getBookingDetailFor(id, ctx);
  const [paymentMethods, freeCancelMinutes, [minLeadMinutes, maxLeadDays], remaining] =
    await Promise.all([
      availablePaymentMethods(),
      getSetting('booking.freeCancellationMinutes'),
      getSettings(['booking.minLeadMinutes', 'booking.maxLeadDays']),
      reschedulesRemaining(id),
    ]);

  // Only offer a time change while nobody is travelling and the job is not an
  // emergency — the same window the server enforces.
  const canReschedule =
    !booking.isEmergency &&
    ['PENDING', 'PROVIDER_NOTIFIED', 'ACCEPTED', 'QUOTE_PENDING', 'QUOTE_APPROVED', 'SCHEDULED'].includes(
      booking.status,
    );

  return (
    <BookingDetailView
      booking={booking}
      paymentMethods={paymentMethods}
      freeCancelMinutes={freeCancelMinutes}
      reschedule={canReschedule ? { remaining, minLeadMinutes, maxLeadDays } : null}
    />
  );
}
