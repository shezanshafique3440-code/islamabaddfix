import { z } from 'zod';

/**
 * Platform settings registry.
 *
 * Business rules live here as typed, admin-editable values instead of being
 * scattered as literals through the codebase. Adding a rule means adding one
 * entry — the admin UI, validation and defaults all derive from this registry.
 */

export const settingsSchema = {
  'platform.commissionRateBp': {
    schema: z.number().int().min(0).max(10_000),
    default: 1000, // 10%
    label: 'Platform commission',
    help: 'Basis points taken from each completed booking. 1000 = 10%.',
    group: 'commerce',
    unit: 'bp',
  },
  'platform.currency': {
    schema: z.literal('PKR'),
    default: 'PKR' as const,
    label: 'Currency',
    help: 'Only PKR is supported at launch.',
    group: 'commerce',
  },
  'platform.city': {
    schema: z.string().min(2).max(60),
    default: 'Islamabad',
    label: 'Launch city',
    help: 'Default city for new addresses and service zones.',
    group: 'general',
  },
  'platform.supportPhone': {
    schema: z.string().min(6).max(24),
    default: '+92 51 000 0000',
    label: 'Support phone',
    help: 'Shown on the support pages and in notifications.',
    group: 'general',
  },
  'platform.supportEmail': {
    schema: z.string().email(),
    default: 'support@islamabadfix.pk',
    label: 'Support email',
    help: 'Reply-to address for customer support.',
    group: 'general',
  },

  'booking.minLeadMinutes': {
    schema: z.number().int().min(0).max(1440),
    default: 60,
    label: 'Minimum lead time',
    help: 'How far ahead a non-emergency booking must be scheduled, in minutes.',
    group: 'booking',
    unit: 'minutes',
  },
  'booking.maxLeadDays': {
    schema: z.number().int().min(1).max(90),
    default: 30,
    label: 'Maximum lead time',
    help: 'How far into the future a booking may be scheduled, in days.',
    group: 'booking',
    unit: 'days',
  },
  'booking.offerFanout': {
    schema: z.number().int().min(1).max(20),
    default: 5,
    label: 'Offer fan-out',
    help: 'How many ranked providers get notified when a customer does not pick one.',
    group: 'booking',
  },
  'booking.offerExpiryMinutes': {
    schema: z.number().int().min(5).max(1440),
    default: 45,
    label: 'Offer expiry',
    help: 'How long a provider has to respond before the offer lapses.',
    group: 'booking',
    unit: 'minutes',
  },
  'booking.freeCancellationMinutes': {
    schema: z.number().int().min(0).max(10_080),
    default: 120,
    label: 'Free cancellation window',
    help: 'Customers may cancel without penalty up to this long before the slot.',
    group: 'booking',
    unit: 'minutes',
  },
  'booking.cancellationFeePaisa': {
    schema: z.number().int().min(0),
    default: 0,
    label: 'Late cancellation fee',
    help: 'Charged when a customer cancels inside the free window. 0 disables it.',
    group: 'booking',
    unit: 'paisa',
  },

  'emergency.enabled': {
    schema: z.boolean(),
    default: true,
    label: 'Emergency bookings enabled',
    help: 'Turns the emergency flow on or off platform-wide.',
    group: 'emergency',
  },
  'emergency.defaultFeePaisa': {
    schema: z.number().int().min(0),
    default: 50_000, // Rs. 500
    label: 'Default emergency fee',
    help: 'Applied when a provider has not set their own emergency fee.',
    group: 'emergency',
    unit: 'paisa',
  },
  'emergency.maxFeePaisa': {
    schema: z.number().int().min(0),
    default: 300_000, // Rs. 3,000
    label: 'Emergency fee cap',
    help: 'Upper bound a provider may set for their emergency fee.',
    group: 'emergency',
    unit: 'paisa',
  },

  'guarantee.enabled': {
    schema: z.boolean(),
    default: true,
    label: 'Fix Guarantee enabled',
    help: 'Master switch for the re-visit guarantee.',
    group: 'guarantee',
  },
  'guarantee.days': {
    schema: z.number().int().min(1).max(365),
    default: 7,
    label: 'Guarantee duration',
    help: 'Days after completion during which a re-visit can be claimed.',
    group: 'guarantee',
    unit: 'days',
  },
  'guarantee.excludedServiceSlugs': {
    schema: z.array(z.string()),
    default: [] as string[],
    label: 'Services excluded from guarantee',
    help: 'Service slugs that never carry the guarantee, regardless of category.',
    group: 'guarantee',
  },
  'guarantee.providerResponsibleByDefault': {
    schema: z.boolean(),
    default: true,
    label: 'Provider bears re-visit cost',
    help: 'Default answer to "who pays for an approved re-visit".',
    group: 'guarantee',
  },

  'matching.weights': {
    schema: z.object({
      serviceMatch: z.number().min(0).max(100),
      availability: z.number().min(0).max(100),
      rating: z.number().min(0).max(100),
      distance: z.number().min(0).max(100),
      responseRate: z.number().min(0).max(100),
      completedJobs: z.number().min(0).max(100),
      workload: z.number().min(0).max(100),
    }),
    default: {
      serviceMatch: 30,
      availability: 20,
      rating: 20,
      distance: 15,
      responseRate: 10,
      completedJobs: 5,
      workload: 10,
    },
    label: 'Matching weights',
    help: 'Relative weight of each signal in the provider scoring algorithm.',
    group: 'matching',
  },
  'matching.maxDistanceKm': {
    schema: z.number().min(1).max(200),
    default: 25,
    label: 'Maximum match distance',
    help: 'Providers further than this from the job are not offered it.',
    group: 'matching',
    unit: 'km',
  },
  'matching.newProviderRatingFloor': {
    schema: z.number().min(0).max(5),
    default: 3.5,
    label: 'Assumed rating for new providers',
    help: 'Rating credited to providers with no reviews yet, so they can get started.',
    group: 'matching',
  },

  'reviews.editWindowHours': {
    schema: z.number().int().min(0).max(720),
    default: 48,
    label: 'Review edit window',
    help: 'How long a customer may edit their review after submitting it.',
    group: 'reviews',
    unit: 'hours',
  },
  'reviews.autoPublish': {
    schema: z.boolean(),
    default: true,
    label: 'Publish reviews immediately',
    help: 'When off, reviews stay hidden until an admin approves them.',
    group: 'reviews',
  },

  'notifications.channels': {
    schema: z.object({
      inApp: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
      whatsapp: z.boolean(),
      push: z.boolean(),
    }),
    default: { inApp: true, email: true, sms: false, whatsapp: false, push: false },
    label: 'Enabled notification channels',
    help: 'A channel also needs its integration configured before anything is sent.',
    group: 'notifications',
  },

  'ai.intakeEnabled': {
    schema: z.boolean(),
    default: true,
    label: 'AI service assistant enabled',
    help: 'When the LLM is not configured this still works as a transparent rule-based classifier.',
    group: 'ai',
  },
  'ai.maxTurns': {
    schema: z.number().int().min(1).max(20),
    default: 6,
    label: 'Assistant clarification turns',
    help: 'Maximum back-and-forth turns before the assistant hands over to booking.',
    group: 'ai',
  },

  'payments.enabledMethods': {
    schema: z.array(z.enum(['CASH', 'BANK_TRANSFER', 'ONLINE_GATEWAY'])),
    default: ['CASH'] as Array<'CASH' | 'BANK_TRANSFER' | 'ONLINE_GATEWAY'>,
    label: 'Enabled payment methods',
    help: 'Online gateway also requires PAYMENT_GATEWAY credentials to appear.',
    group: 'commerce',
  },

  'providers.autoApprove': {
    schema: z.boolean(),
    default: false,
    label: 'Auto-approve providers',
    help: 'Strongly discouraged. Manual review is the default because the badge means something.',
    group: 'providers',
  },
  'providers.requireCnicForVerification': {
    schema: z.boolean(),
    default: true,
    label: 'Require CNIC document',
    help: 'Identity verification cannot be approved without a submitted document.',
    group: 'providers',
  },
} as const;

export type SettingKey = keyof typeof settingsSchema;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchema)[K]['schema']>;

export const settingKeys = Object.keys(settingsSchema) as SettingKey[];

export const settingGroups = [
  'general',
  'booking',
  'commerce',
  'matching',
  'emergency',
  'guarantee',
  'reviews',
  'notifications',
  'ai',
  'providers',
] as const;
export type SettingGroup = (typeof settingGroups)[number];

export function defaultSettings(): { [K in SettingKey]: SettingValue<K> } {
  const out = {} as { [K in SettingKey]: SettingValue<K> };
  for (const key of settingKeys) {
    // The registry's `default` is typed per key; the cast collapses the union.
    (out as Record<string, unknown>)[key] = settingsSchema[key].default;
  }
  return out;
}
