-- Database-level invariants. These back up the application rules so a bug in
-- one code path cannot write nonsense into financial or rating columns.

-- Money is stored in paisa and can never be negative.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_money_nonneg" CHECK (
    coalesce("approvedTotalPaisa", 0) >= 0
    AND coalesce("finalTotalPaisa", 0) >= 0
    AND coalesce("commissionPaisa", 0) >= 0
    AND coalesce("providerEarningsPaisa", 0) >= 0
    AND "emergencyFeePaisa" >= 0
    AND "discountPaisa" >= 0
  ),
  ADD CONSTRAINT "booking_commission_rate_range" CHECK (
    "commissionRateBp" IS NULL OR ("commissionRateBp" >= 0 AND "commissionRateBp" <= 10000)
  ),
  -- A booking that reached a provider-owned state must have a provider.
  ADD CONSTRAINT "booking_provider_required_for_active_states" CHECK (
    "providerId" IS NOT NULL
    OR "status" IN ('PENDING', 'PROVIDER_NOTIFIED', 'CANCELLED')
  ),
  ADD CONSTRAINT "booking_window_positive" CHECK ("scheduledWindowMinutes" > 0);

ALTER TABLE "QuoteItem"
  ADD CONSTRAINT "quote_item_positive" CHECK ("quantity" > 0 AND "unitPricePaisa" >= 0);

ALTER TABLE "Quote"
  ADD CONSTRAINT "quote_subtotal_nonneg" CHECK ("subtotalPaisa" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_amount_nonneg" CHECK ("amountPaisa" >= 0 AND "refundedPaisa" >= 0),
  ADD CONSTRAINT "payment_refund_within_amount" CHECK ("refundedPaisa" <= "amountPaisa");

ALTER TABLE "Payout"
  ADD CONSTRAINT "payout_money_nonneg" CHECK (
    "grossPaisa" >= 0 AND "commissionPaisa" >= 0 AND "netPaisa" >= 0
  ),
  ADD CONSTRAINT "payout_period_order" CHECK ("periodEnd" >= "periodStart");

ALTER TABLE "PayoutItem"
  ADD CONSTRAINT "payout_item_money_nonneg" CHECK (
    "grossPaisa" >= 0 AND "commissionPaisa" >= 0 AND "netPaisa" >= 0
  );

-- Ratings are 1..5 on every axis.
ALTER TABLE "Review"
  ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "review_subscores_range" CHECK (
    ("serviceQuality"  IS NULL OR "serviceQuality"  BETWEEN 1 AND 5)
    AND ("professionalism" IS NULL OR "professionalism" BETWEEN 1 AND 5)
    AND ("punctuality"     IS NULL OR "punctuality"     BETWEEN 1 AND 5)
    AND ("valueForMoney"   IS NULL OR "valueForMoney"   BETWEEN 1 AND 5)
    AND ("providerRatingOfCustomer" IS NULL OR "providerRatingOfCustomer" BETWEEN 1 AND 5)
  );

ALTER TABLE "ProviderProfile"
  ADD CONSTRAINT "provider_rating_range" CHECK (
    "ratingAverage" IS NULL OR ("ratingAverage" >= 0 AND "ratingAverage" <= 5)
  ),
  ADD CONSTRAINT "provider_counters_nonneg" CHECK (
    "completedJobs" >= 0 AND "cancelledJobs" >= 0 AND "ratingCount" >= 0
    AND "offeredJobs" >= 0 AND "acceptedJobs" >= 0 AND "noShowJobs" >= 0
    AND "emergencyFeePaisa" >= 0
  ),
  ADD CONSTRAINT "provider_radius_positive" CHECK ("serviceRadiusKm" > 0),
  ADD CONSTRAINT "provider_max_active_positive" CHECK ("maxActiveJobs" > 0),
  ADD CONSTRAINT "provider_response_rate_range" CHECK ("responseRate" >= 0 AND "responseRate" <= 1);

ALTER TABLE "ProviderService"
  ADD CONSTRAINT "provider_service_price_nonneg" CHECK ("startingPricePaisa" >= 0);

ALTER TABLE "Service"
  ADD CONSTRAINT "service_price_range" CHECK (
    "minPricePaisa" >= 0
    AND ("maxPricePaisa" IS NULL OR "maxPricePaisa" >= "minPricePaisa")
  ),
  ADD CONSTRAINT "service_duration_positive" CHECK ("estimatedMinutes" > 0);

-- Availability windows must be inside a day and non-empty.
ALTER TABLE "ProviderAvailability"
  ADD CONSTRAINT "availability_day_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT "availability_window_valid" CHECK (
    "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"
  );

ALTER TABLE "ProviderLocation"
  ADD CONSTRAINT "location_latlng_range" CHECK (
    "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
  );

ALTER TABLE "Address"
  ADD CONSTRAINT "address_latlng_range" CHECK (
    ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
    AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  );

ALTER TABLE "UploadedFile"
  ADD CONSTRAINT "file_size_positive" CHECK ("sizeBytes" > 0);

ALTER TABLE "PromoCode"
  ADD CONSTRAINT "promo_value_positive" CHECK ("value" > 0),
  ADD CONSTRAINT "promo_percentage_bounded" CHECK (
    "kind" <> 'PERCENTAGE' OR "value" <= 10000
  ),
  ADD CONSTRAINT "promo_limits_nonneg" CHECK (
    "usageCount" >= 0 AND "perCustomerLimit" >= 0 AND "minOrderPaisa" >= 0
  );

ALTER TABLE "Dispute"
  ADD CONSTRAINT "dispute_refund_nonneg" CHECK ("refundPaisa" >= 0);

-- Exactly one default address per user (partial unique index).
CREATE UNIQUE INDEX "address_one_default_per_user"
  ON "Address" ("userId")
  WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- A booking may have at most one approved quote that is not superseded.
CREATE UNIQUE INDEX "quote_one_approved_per_booking"
  ON "Quote" ("bookingId")
  WHERE "status" = 'APPROVED' AND "isAdditional" = false;

-- Case-insensitive uniqueness on email, so Ali@x.com cannot shadow ali@x.com.
CREATE UNIQUE INDEX "user_email_lower_unique" ON "User" (lower("email"));

-- Frequently-filtered partial indexes for the public catalogue and matcher.
CREATE INDEX "provider_verified_lookup"
  ON "ProviderProfile" ("city", "ratingAverage")
  WHERE "status" = 'VERIFIED' AND "deletedAt" IS NULL;

CREATE INDEX "booking_open_offers"
  ON "BookingOffer" ("providerId", "notifiedAt")
  WHERE "respondedAt" IS NULL;
