/**
 * What a booking actually costs the customer.
 *
 * The agreed quote total is not the amount payable: promo codes and membership
 * benefits come off it. Commission has always been calculated on the reduced
 * amount, so anything that charges or displays the un-reduced total is charging
 * a customer for a discount they were given. One helper, used by the payment
 * path and by every surface that shows a total, keeps those two in step.
 */

export interface BookingTotals {
  /** Sum of the approved quote, plus any emergency fee. */
  agreedPaisa: number;
  promoDiscountPaisa: number;
  membershipDiscountPaisa: number;
  /** Agreed, less every discount. This is the number the customer owes. */
  payablePaisa: number;
}

export function bookingTotals(booking: {
  finalTotalPaisa: number | null;
  approvedTotalPaisa: number | null;
  discountPaisa: number;
  membershipDiscountPaisa: number;
}): BookingTotals {
  const agreedPaisa = booking.finalTotalPaisa ?? booking.approvedTotalPaisa ?? 0;
  const promoDiscountPaisa = Math.min(booking.discountPaisa, agreedPaisa);
  const membershipDiscountPaisa = Math.min(
    booking.membershipDiscountPaisa,
    agreedPaisa - promoDiscountPaisa,
  );
  return {
    agreedPaisa,
    promoDiscountPaisa,
    membershipDiscountPaisa,
    payablePaisa: Math.max(0, agreedPaisa - promoDiscountPaisa - membershipDiscountPaisa),
  };
}
