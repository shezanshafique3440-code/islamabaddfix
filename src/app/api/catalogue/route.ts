import { ok, route } from '@/lib/http';
import { getCatalogue } from '@/lib/catalogue';
import { availablePaymentMethods } from '@/lib/payments';
import { getSetting } from '@/lib/settings';

/** Public catalogue plus the booking constraints the wizard needs. */
export const GET = route(async () => {
  const [categories, paymentMethods, minLeadMinutes, maxLeadDays, emergencyEnabled, guaranteeDays] =
    await Promise.all([
      getCatalogue(),
      availablePaymentMethods(),
      getSetting('booking.minLeadMinutes'),
      getSetting('booking.maxLeadDays'),
      getSetting('emergency.enabled'),
      getSetting('guarantee.days'),
    ]);

  return ok({
    categories,
    paymentMethods,
    booking: { minLeadMinutes, maxLeadDays },
    emergencyEnabled,
    guaranteeDays,
  });
});
