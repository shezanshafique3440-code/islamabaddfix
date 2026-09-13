import { z } from 'zod';
import { passwordSchema } from '../auth/password';

/**
 * Request schemas.
 *
 * Every API route parses its input through one of these. Nothing reaches a
 * service function untyped, and error messages are written for the person
 * filling in the form, in the same Roman Urdu the UI uses.
 */

// ------------------------------------------------------------------ primitives

export const uuidSchema = z.string().uuid('A valid id is required.');

export const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Enter the complete phone number.')
  .max(20, 'That phone number is too long.')
  .regex(/^[\d\s+()-]+$/, 'A phone number can only contain digits.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254);

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'The name must be at least 2 characters.')
  .max(120, 'That name is too long.');

/** Money accepted from clients as whole rupees, converted to paisa. */
export const rupeesSchema = z
  .number({ invalid_type_error: 'Enter a number in rupees.' })
  .int('Enter rupees as a whole number.')
  .min(0, 'The amount cannot be negative.')
  .max(5_000_000, 'That amount is too large.');

export const paisaSchema = z.number().int().min(0).max(500_000_000);

export const ratingSchema = z
  .number()
  .int('The rating must be between 1 and 5.')
  .min(1, 'The rating must be between 1 and 5.')
  .max(5, 'The rating must be between 1 and 5.');

/** Accepts an ISO string or Date, and rejects anything unparseable. */
export const dateSchema = z.coerce.date({ invalid_type_error: 'Pick a valid date and time.' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

// ------------------------------------------------------------------------ auth

export const registerSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  role: z.enum(['CUSTOMER', 'PROVIDER']).default('CUSTOMER'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms.' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'The new password must be different from the old one.',
    path: ['newPassword'],
  });

export const updateProfileSchema = z.object({
  fullName: nameSchema.optional(),
  phone: phoneSchema.optional(),
});

// ------------------------------------------------------- verification flows

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'That reset link is incomplete.').max(400),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20, 'That verification link is incomplete.').max(400),
});

export const requestPhoneCodeSchema = z.object({
  phone: phoneSchema.optional(),
});

export const confirmPhoneCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is six digits.'),
});

// ---------------------------------------------------------------- two-factor

export const twoFactorChallengeSchema = z.object({
  challengeToken: z.string().min(20).max(400),
  /** A six-digit TOTP code, or a recovery code like A1B2C-3D4E5. */
  code: z.string().trim().min(6).max(20),
});

export const twoFactorCodeSchema = z.object({
  action: z.enum(['confirm', 'disable']),
  code: z.string().trim().min(6).max(20),
});

// ------------------------------------------------------------------- account

export const notificationPreferencesSchema = z
  .object({
    email: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
    push: z.boolean(),
    marketing: z.boolean(),
  })
  .partial();

export const closeAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password.'),
  reason: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------- address

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  zoneId: uuidSchema.optional().nullable(),
  city: z.string().trim().min(2).max(60).default('Islamabad'),
  addressLine: z
    .string()
    .trim()
    .min(5, 'Please write the address in a little more detail.')
    .max(300, 'That address is too long.'),
  houseOrBuilding: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  contactPhone: phoneSchema.optional(),
  isDefault: z.boolean().default(false),
});

// --------------------------------------------------------------------- booking

export const createBookingSchema = z.object({
  serviceId: uuidSchema,
  addressId: uuidSchema,
  problemDescription: z
    .string()
    .trim()
    .min(10, 'Describe the problem in at least 10 characters.')
    .max(2000, 'That description is too long.'),
  providerId: uuidSchema.optional().nullable(),
  scheduledFor: dateSchema.optional().nullable(),
  urgency: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).default('NORMAL'),
  isEmergency: z.boolean().default(false),
  customerNotes: z.string().trim().max(1000).optional(),
  fileIds: z.array(uuidSchema).max(8, 'You can attach up to 8 files.').optional(),
  intakeSummary: z.record(z.unknown()).optional().nullable(),
  promoCode: z.string().trim().min(3).max(32).optional(),
});

export const bookingListQuerySchema = paginationSchema.extend({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return Array.isArray(value) ? value : value.split(',').filter(Boolean);
    }),
  scope: z.enum(['active', 'upcoming', 'completed', 'cancelled', 'disputed', 'all']).default('all'),
  search: z.string().trim().max(120).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, 'Give a reason for cancelling.')
    .max(500, 'That reason is too long.'),
});

export const bookingStatusActionSchema = z.object({
  action: z.enum([
    'accept',
    'decline',
    'confirm_schedule',
    'on_the_way',
    'arrived',
    'start',
    'complete',
    'resume',
  ]),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  scheduledFor: dateSchema.optional().nullable(),
});

// --------------------------------------------------------- booking messaging

export const bookingMessageSchema = z.object({
  body: z.string().trim().max(2000, 'That message is too long.'),
  attachmentId: uuidSchema.optional().nullable(),
});

export const rescheduleSchema = z.object({
  scheduledFor: dateSchema,
  reason: z.string().trim().max(300).optional(),
});

// ---------------------------------------------------------------------- quotes

export const quoteItemSchema = z.object({
  kind: z.enum(['INSPECTION', 'LABOUR', 'PARTS', 'EMERGENCY_FEE', 'TRAVEL', 'OTHER']),
  label: z.string().trim().min(2, 'Enter an item name.').max(120),
  quantity: z.number().int().min(1).max(999).default(1),
  // Providers type rupees; paisa conversion happens in the route.
  unitPriceRupees: rupeesSchema,
});

export const submitQuoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1, 'Add at least one item.').max(20, 'Up to 20 items.'),
  notes: z.string().trim().max(1000).optional(),
  validUntil: dateSchema.optional().nullable(),
});

export const quoteDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------- reviews

export const createReviewSchema = z.object({
  rating: ratingSchema,
  comment: z.string().trim().max(1500).optional(),
  serviceQuality: ratingSchema.optional(),
  professionalism: ratingSchema.optional(),
  punctuality: ratingSchema.optional(),
  valueForMoney: ratingSchema.optional(),
});

export const rateCustomerSchema = z.object({
  rating: ratingSchema,
  comment: z.string().trim().max(600).optional(),
});

// -------------------------------------------------------------------- payments

export const initiatePaymentSchema = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER', 'ONLINE_GATEWAY']),
  returnUrl: z.string().url().optional(),
});

export const settlePaymentSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

export const refundSchema = z.object({
  amountRupees: rupeesSchema.optional(),
  full: z.boolean().default(false),
  reason: z.string().trim().min(4, 'Give a reason for the refund.').max(500),
});

// -------------------------------------------------------------------- disputes

export const createDisputeSchema = z.object({
  reason: z.enum([
    'TECHNICIAN_NO_SHOW',
    'POOR_SERVICE',
    'WRONG_PRICE',
    'UNAUTHORIZED_CHARGE',
    'DAMAGE',
    'OTHER',
  ]),
  description: z
    .string()
    .trim()
    .min(15, 'Describe the problem in a little detail (at least 15 characters).')
    .max(2000),
  fileIds: z.array(uuidSchema).max(8).optional(),
});

export const resolveDisputeSchema = z.object({
  status: z.enum([
    'UNDER_REVIEW',
    'AWAITING_CUSTOMER',
    'AWAITING_PROVIDER',
    'RESOLVED_REFUND',
    'RESOLVED_PARTIAL_REFUND',
    'RESOLVED_REVISIT',
    'RESOLVED_NO_ACTION',
    'CLOSED',
  ]),
  notes: z.string().trim().max(2000).optional(),
  refundRupees: rupeesSchema.optional(),
});

// ------------------------------------------------------------------ guarantees

export const createGuaranteeClaimSchema = z.object({
  description: z
    .string()
    .trim()
    .min(15, 'Describe the problem in a little detail (at least 15 characters).')
    .max(2000),
  fileIds: z.array(uuidSchema).max(8).optional(),
});

export const decideGuaranteeClaimSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REVISIT_SCHEDULED', 'RESOLVED', 'REJECTED']),
  notes: z.string().trim().max(2000).optional(),
  revisitScheduledFor: dateSchema.optional().nullable(),
  providerResponsible: z.boolean().optional(),
});

// ------------------------------------------------------------------- providers

export const providerOnboardingSchema = z.object({
  businessName: z.string().trim().min(3, 'Enter your business or your own name.').max(120),
  contactPhone: phoneSchema,
  headline: z.string().trim().max(140).optional(),
  description: z.string().trim().max(2000).optional(),
  yearsExperience: z
    .number()
    .int()
    .min(0, 'Experience cannot be negative.')
    .max(60, 'Experience cannot be more than 60 years.'),
  addressLine: z.string().trim().max(300).optional(),
  sector: z.string().trim().max(60).optional(),
  services: z
    .array(
      z.object({
        serviceId: uuidSchema,
        startingPriceRupees: rupeesSchema,
      }),
    )
    .min(1, 'Select at least one service.')
    .max(60),
  zoneIds: z.array(uuidSchema).min(1, 'Select at least one service area.').max(60),
  availability: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        })
        .refine((window) => window.endMinute > window.startMinute, {
          message: 'The end time must be after the start time.',
        }),
    )
    .max(21)
    .default([]),
  emergencyAvailable: z.boolean().default(false),
  emergencyFeeRupees: rupeesSchema.optional(),
  serviceRadiusKm: z.number().int().min(1).max(100).default(15),
  cnicReference: z
    .string()
    .trim()
    .max(20)
    .optional()
    // We store a reference, not the CNIC itself; reject anything that looks like
    // a full 13-digit number so it cannot be captured by accident.
    .refine((value) => !value || value.replace(/\D/g, '').length <= 6, {
      message: 'Do not enter the full CNIC number — last 4 digits only.',
    }),
  bankAccountTitle: z.string().trim().max(120).optional(),
  bankName: z.string().trim().max(120).optional(),
  bankIban: z
    .string()
    .trim()
    .max(34)
    .regex(/^PK\d{2}[A-Z0-9]{16,20}$/i, 'Enter a valid Pakistani IBAN (starting with PK).')
    .optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the provider terms.' }),
  }),
});

export const providerLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(10_000).optional(),
});

export const providerSettingsSchema = z.object({
  shareLiveLocation: z.boolean().optional(),
  maxActiveJobs: z.number().int().min(1).max(50).optional(),
  emergencyAvailable: z.boolean().optional(),
  emergencyFeeRupees: rupeesSchema.optional(),
  serviceRadiusKm: z.number().int().min(1).max(100).optional(),
});

export const providerListQuerySchema = paginationSchema.extend({
  categorySlug: z.string().trim().max(80).optional(),
  serviceSlug: z.string().trim().max(80).optional(),
  zoneSlug: z.string().trim().max(80).optional(),
  emergencyOnly: z.coerce.boolean().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['rating', 'jobs', 'experience', 'newest']).optional(),
});

export const providerDecisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  reason: z.string().trim().max(600).optional(),
  note: z.string().trim().max(600).optional(),
});

export const verificationUpdateSchema = z.object({
  kind: z.enum(['IDENTITY_CNIC', 'PHONE', 'EMAIL', 'PLATFORM_ONBOARDING', 'BANK_ACCOUNT']),
  status: z.enum(['NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'REJECTED']),
  notes: z.string().trim().max(600).optional(),
});

// ------------------------------------------------------------------- catalogue

export const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  iconKey: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  isEmergencyCategory: z.boolean().optional(),
  guaranteeEligible: z.boolean().optional(),
});

export const serviceWriteSchema = z.object({
  categoryId: uuidSchema,
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  minPriceRupees: rupeesSchema.optional(),
  maxPriceRupees: rupeesSchema.optional().nullable(),
  requiresInspection: z.boolean().optional(),
  estimatedMinutes: z.number().int().min(15).max(1440).optional(),
  isActive: z.boolean().optional(),
  isEmergencyEnabled: z.boolean().optional(),
  guaranteeEligible: z.boolean().optional(),
  guaranteeDaysOverride: z.number().int().min(1).max(365).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const zoneWriteSchema = z.object({
  name: z.string().trim().min(1).max(60),
  city: z.string().trim().min(2).max(60).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

// -------------------------------------------------------------------- settings

export const settingWriteSchema = z.object({
  key: z.string().trim().min(3).max(80),
  value: z.unknown(),
});

// -------------------------------------------------------------------------- AI

export const intakeSchema = z.object({
  message: z
    .string()
    .trim()
    .min(3, 'Please describe your problem in a little more detail.')
    .max(1500, 'That message is too long.'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(20)
    .optional(),
});

// -------------------------------------------------------------------- matching

export const matchQuerySchema = z.object({
  serviceId: uuidSchema,
  addressId: uuidSchema.optional(),
  zoneId: uuidSchema.optional(),
  scheduledFor: dateSchema.optional(),
  isEmergency: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// --------------------------------------------------------------------- support

export const createTicketSchema = z.object({
  subject: z.string().trim().min(5, 'Enter a subject.').max(160),
  description: z.string().trim().min(15, 'Describe the problem in detail.').max(3000),
  bookingId: uuidSchema.optional().nullable(),
  fileIds: z.array(uuidSchema).max(5).optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  assigneeId: uuidSchema.optional().nullable(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message.').max(2000),
  attachmentId: uuidSchema.optional().nullable(),
});

// ----------------------------------------------------------------------- promo

export const promoWriteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(32)
      .regex(/^[A-Z0-9-]+$/, 'The code can only contain letters, digits and dashes.'),
    kind: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    /** Percent for PERCENTAGE, rupees for FIXED_AMOUNT. */
    value: z.number().min(0.01),
    maxDiscountRupees: rupeesSchema.optional().nullable(),
    minOrderRupees: rupeesSchema.default(0),
    usageLimit: z.number().int().min(1).max(1_000_000).optional().nullable(),
    perCustomerLimit: z.number().int().min(1).max(100).default(1),
    startsAt: dateSchema.optional().nullable(),
    endsAt: dateSchema.optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.kind !== 'PERCENTAGE' || data.value <= 100, {
    message: 'The percentage cannot be more than 100.',
    path: ['value'],
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'The end date must be after the start date.',
    path: ['endsAt'],
  });

// ---------------------------------------------------------------------- payouts

export const createPayoutSchema = z.object({
  providerId: uuidSchema,
  periodStart: dateSchema,
  periodEnd: dateSchema,
  notes: z.string().trim().max(600).optional(),
});

export const markPayoutPaidSchema = z.object({
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(600).optional(),
});

// ------------------------------------------------------------------- user admin

export const adminUserQuerySchema = paginationSchema.extend({
  role: z.enum(['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN']).optional(),
  search: z.string().trim().max(120).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const changeRoleSchema = z.object({
  role: z.enum(['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN']),
  reason: z.string().trim().min(4, 'Give a reason.').max(500),
});

export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(4, 'Give a reason.').max(500),
});

// ------------------------------------------------------------------ memberships

export const membershipPlanWriteSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'The code can only contain letters, digits and dashes.'),
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(60),
  tagline: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(10, 'Enter at least 10 characters.').max(1000),
  priceRupees: rupeesSchema,
  periodDays: z.number().int().min(7, 'A plan must run for at least 7 days.').max(1095),
  /** Percent, converted to basis points server-side. */
  discountPercent: z.number().min(0).max(50).default(0),
  maxDiscountRupees: rupeesSchema.optional().nullable(),
  guaranteeBonusDays: z.number().int().min(0).max(365).default(0),
  priorityFanoutBonus: z.number().int().min(0).max(20).default(0),
  emergencyFeeWaiverRupees: rupeesSchema.default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const membershipPurchaseSchema = z.object({
  planId: uuidSchema,
  method: z.enum(['CASH', 'BANK_TRANSFER', 'ONLINE_GATEWAY']),
});

export const membershipCancelSchema = z.object({
  reason: z.string().trim().min(4, 'Give a reason.').max(500),
});

export const membershipConfirmSchema = z.object({
  externalRef: z.string().trim().max(120).optional().nullable(),
});

export const adminMembershipQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  search: z.string().trim().max(120).optional(),
});

// ------------------------------------------------------------- repeat visits

export const recurringCreateSchema = z
  .object({
    serviceId: uuidSchema,
    addressId: uuidSchema,
    providerId: uuidSchema.optional().nullable(),
    frequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY']),
    intervalCount: z.number().int().min(1).max(12).default(1),
    /** Minutes past local midnight, e.g. 600 = 10:00. */
    timeOfDayMinutes: z.number().int().min(0).max(1439),
    dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
    /** Capped at 28 so every month actually has the day. */
    dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
    problemDescription: z
      .string()
      .trim()
      .min(10, 'Describe the problem in at least 10 characters.')
      .max(3000),
    customerNotes: z.string().trim().max(600).optional().nullable(),
    startsOn: dateSchema.optional().nullable(),
    maxOccurrences: z.number().int().min(1).max(200).optional().nullable(),
    endsAt: dateSchema.optional().nullable(),
  })
  .refine(
    (data) =>
      data.frequency === 'MONTHLY' || data.frequency === 'QUARTERLY' || data.dayOfWeek !== null,
    { message: 'Choose a day of the week.', path: ['dayOfWeek'] },
  )
  .refine(
    (data) =>
      (data.frequency !== 'MONTHLY' && data.frequency !== 'QUARTERLY') || data.dayOfMonth !== null,
    { message: 'Choose a day of the month.', path: ['dayOfMonth'] },
  );

export const recurringStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']),
  reason: z.string().trim().max(500).optional().nullable(),
});
