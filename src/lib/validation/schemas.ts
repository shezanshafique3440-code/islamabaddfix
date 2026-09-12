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

export const uuidSchema = z.string().uuid('Valid id darkar hai.');

export const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Phone number mukammal likhein.')
  .max(20, 'Phone number bohat lamba hai.')
  .regex(/^[\d\s+()-]+$/, 'Phone number mein sirf digits ho sakte hain.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Valid email address likhein.')
  .max(254);

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Naam kam az kam 2 characters ka ho.')
  .max(120, 'Naam bohat lamba hai.');

/** Money accepted from clients as whole rupees, converted to paisa. */
export const rupeesSchema = z
  .number({ invalid_type_error: 'Rupees mein number likhein.' })
  .int('Rupees poore number mein likhein.')
  .min(0, 'Amount negative nahi ho sakti.')
  .max(5_000_000, 'Amount bohat zyada hai.');

export const paisaSchema = z.number().int().min(0).max(500_000_000);

export const ratingSchema = z
  .number()
  .int('Rating 1 se 5 ke darmiyan honi chahiye.')
  .min(1, 'Rating 1 se 5 ke darmiyan honi chahiye.')
  .max(5, 'Rating 1 se 5 ke darmiyan honi chahiye.');

/** Accepts an ISO string or Date, and rejects anything unparseable. */
export const dateSchema = z.coerce.date({ invalid_type_error: 'Valid date aur time chunein.' });

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
    errorMap: () => ({ message: 'Terms accept karna zaroori hai.' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password likhein.'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mojooda password likhein.'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Naya password purane se mukhtalif hona chahiye.',
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
  token: z.string().min(20, 'Reset link adhoora hai.').max(400),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20, 'Verification link adhoora hai.').max(400),
});

export const requestPhoneCodeSchema = z.object({
  phone: phoneSchema.optional(),
});

export const confirmPhoneCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code chhe hindson ka hota hai.'),
});

// --------------------------------------------------------------------- address

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  zoneId: uuidSchema.optional().nullable(),
  city: z.string().trim().min(2).max(60).default('Islamabad'),
  addressLine: z
    .string()
    .trim()
    .min(5, 'Address thoda tafseel se likhein.')
    .max(300, 'Address bohat lamba hai.'),
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
    .min(10, 'Masla kam az kam 10 characters mein batayein.')
    .max(2000, 'Tafseel bohat lambi hai.'),
  providerId: uuidSchema.optional().nullable(),
  scheduledFor: dateSchema.optional().nullable(),
  urgency: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).default('NORMAL'),
  isEmergency: z.boolean().default(false),
  customerNotes: z.string().trim().max(1000).optional(),
  fileIds: z.array(uuidSchema).max(8, 'Zyada se zyada 8 files attach ki ja sakti hain.').optional(),
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
    .min(4, 'Cancel karne ki wajah likhein.')
    .max(500, 'Wajah bohat lambi hai.'),
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
  body: z.string().trim().max(2000, 'Message bohat lamba hai.'),
  attachmentId: uuidSchema.optional().nullable(),
});

export const rescheduleSchema = z.object({
  scheduledFor: dateSchema,
  reason: z.string().trim().max(300).optional(),
});

// ---------------------------------------------------------------------- quotes

export const quoteItemSchema = z.object({
  kind: z.enum(['INSPECTION', 'LABOUR', 'PARTS', 'EMERGENCY_FEE', 'TRAVEL', 'OTHER']),
  label: z.string().trim().min(2, 'Item ka naam likhein.').max(120),
  quantity: z.number().int().min(1).max(999).default(1),
  // Providers type rupees; paisa conversion happens in the route.
  unitPriceRupees: rupeesSchema,
});

export const submitQuoteSchema = z.object({
  items: z
    .array(quoteItemSchema)
    .min(1, 'Kam az kam ek item add karein.')
    .max(20, 'Zyada se zyada 20 items.'),
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
  reason: z.string().trim().min(4, 'Refund ki wajah likhein.').max(500),
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
    .min(15, 'Masla thoda tafseel se batayein (kam az kam 15 characters).')
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
    .min(15, 'Masla thoda tafseel se batayein (kam az kam 15 characters).')
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
  businessName: z
    .string()
    .trim()
    .min(3, 'Business ya apna naam likhein.')
    .max(120),
  contactPhone: phoneSchema,
  headline: z.string().trim().max(140).optional(),
  description: z.string().trim().max(2000).optional(),
  yearsExperience: z
    .number()
    .int()
    .min(0, 'Experience negative nahi ho sakta.')
    .max(60, 'Experience 60 saal se zyada nahi ho sakta.'),
  addressLine: z.string().trim().max(300).optional(),
  sector: z.string().trim().max(60).optional(),
  services: z
    .array(
      z.object({
        serviceId: uuidSchema,
        startingPriceRupees: rupeesSchema,
      }),
    )
    .min(1, 'Kam az kam ek service select karein.')
    .max(60),
  zoneIds: z.array(uuidSchema).min(1, 'Kam az kam ek service area select karein.').max(60),
  availability: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        })
        .refine((window) => window.endMinute > window.startMinute, {
          message: 'Khatam hone ka waqt shuru se baad hona chahiye.',
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
      message: 'Poora CNIC number na likhein — sirf aakhri 4 digits.',
    }),
  bankAccountTitle: z.string().trim().max(120).optional(),
  bankName: z.string().trim().max(120).optional(),
  bankIban: z
    .string()
    .trim()
    .max(34)
    .regex(/^PK\d{2}[A-Z0-9]{16,20}$/i, 'Valid Pakistani IBAN likhein (PK se shuru).')
    .optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Provider terms accept karna zaroori hai.' }),
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
    .min(3, 'Apna masla thoda tafseel se likhein.')
    .max(1500, 'Message bohat lamba hai.'),
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
  subject: z.string().trim().min(5, 'Subject likhein.').max(160),
  description: z.string().trim().min(15, 'Masla tafseel se batayein.').max(3000),
  bookingId: uuidSchema.optional().nullable(),
  fileIds: z.array(uuidSchema).max(5).optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  assigneeId: uuidSchema.optional().nullable(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Message likhein.').max(2000),
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
      .regex(/^[A-Z0-9-]+$/, 'Code mein sirf letters, digits aur dash ho sakte hain.'),
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
    message: 'Percentage 100 se zyada nahi ho sakta.',
    path: ['value'],
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'Khatam hone ki tareekh shuru se baad honi chahiye.',
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
  reason: z.string().trim().min(4, 'Wajah likhein.').max(500),
});

export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(4, 'Wajah likhein.').max(500),
});
