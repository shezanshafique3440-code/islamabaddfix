import type { Metadata } from 'next';
import { requirePageRole } from '@/lib/auth/session';
import { getBookingDetailFor } from '@/lib/bookings/queries';
import { availablePaymentMethods } from '@/lib/payments';
import { getSetting } from '@/lib/settings';
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
  const [paymentMethods, freeCancelMinutes] = await Promise.all([
    availablePaymentMethods(),
    getSetting('booking.freeCancellationMinutes'),
  ]);

  return (
    <BookingDetailView
      booking={booking}
      paymentMethods={paymentMethods}
      freeCancelMinutes={freeCancelMinutes}
    />
  );
}
