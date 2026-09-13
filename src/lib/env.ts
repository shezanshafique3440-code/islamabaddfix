import { z } from 'zod';

/**
 * Validated server environment.
 *
 * Rules:
 *  - Only DATABASE_URL and AUTH_SECRET are hard requirements.
 *  - Every integration is optional and reports its own `configured` flag.
 *    Features whose integration is missing must degrade to an explicit
 *    "not configured" state — never to fabricated success.
 *  - This module must never be imported from client components.
 */

const bool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : v === 'true' || v === '1'));

const int = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .pipe(z.number().int().positive());

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ALLOWED_ORIGINS: optionalString,

  ACCESS_TOKEN_TTL_SECONDS: int(900),
  REFRESH_TOKEN_TTL_SECONDS: int(60 * 60 * 24 * 30),
  AUTH_MAX_FAILED_ATTEMPTS: int(8),
  AUTH_LOCKOUT_MINUTES: int(15),

  AI_PROVIDER: z.enum(['anthropic', 'openai', 'none']).default('none'),
  AI_API_KEY: optionalString,
  AI_MODEL: z.string().default('claude-sonnet-5'),
  AI_BASE_URL: optionalString,

  MAPS_PROVIDER: z.enum(['google', 'mapbox', 'none']).default('none'),
  MAPS_API_KEY: optionalString,

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  STORAGE_ENDPOINT: optionalString,
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: optionalString,
  STORAGE_SECRET_KEY: optionalString,
  STORAGE_BUCKET: z.string().default('islamabad-fix'),
  STORAGE_FORCE_PATH_STYLE: bool(true),

  EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'none']).default('none'),
  EMAIL_API_KEY: optionalString,
  EMAIL_FROM: z.string().default('Islamabad Fix <no-reply@example.com>'),
  SMTP_URL: optionalString,

  WHATSAPP_API_KEY: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
  WHATSAPP_APP_SECRET: optionalString,

  SMS_PROVIDER: z.enum(['none', 'generic', 'twilio']).default('none'),
  SMS_API_KEY: optionalString,
  SMS_SENDER_ID: z.string().default('ISBFIX'),
  // Twilio needs an account SID alongside the auth token in SMS_API_KEY.
  SMS_ACCOUNT_SID: optionalString,
  /*
   * The `generic` driver, for the Pakistani aggregators that each invent their
   * own shape. The operator supplies the shape rather than the code guessing
   * it: a URL with {key} {to} {text} {from} placeholders, and — for POST — a
   * body template using the same placeholders.
   */
  SMS_GATEWAY_URL: optionalString,
  SMS_GATEWAY_METHOD: z.enum(['GET', 'POST']).default('GET'),
  SMS_GATEWAY_BODY: optionalString,
  SMS_GATEWAY_CONTENT_TYPE: z.string().default('application/x-www-form-urlencoded'),
  /** Extra headers, as `Name: value` pairs separated by newlines or `|`. */
  SMS_GATEWAY_HEADERS: optionalString,

  VAPI_API_KEY: optionalString,
  VAPI_WEBHOOK_SECRET: optionalString,

  PAYMENT_GATEWAY: z.enum(['none', 'generic']).default('none'),
  PAYMENT_API_KEY: optionalString,
  PAYMENT_WEBHOOK_SECRET: optionalString,
  /*
   * The `generic` driver posts a signed checkout request and follows the
   * redirect the gateway answers with — the shape JazzCash, Easypaisa and
   * Safepay all share. The endpoint and merchant id come from the gateway;
   * without them the driver reports itself unconfigured rather than failing at
   * the moment someone tries to pay.
   */
  PAYMENT_CHECKOUT_URL: optionalString,
  PAYMENT_MERCHANT_ID: optionalString,
  /** Signs the outgoing checkout request. Falls back to PAYMENT_API_KEY. */
  PAYMENT_SIGNING_SECRET: optionalString,

  // Masked calling. With no provider the app hands over the real number it
  // already shares after acceptance, and labels it as such.
  CALLING_PROVIDER: z.enum(['none', 'twilio', 'vonage']).default('none'),
  CALLING_API_KEY: optionalString,
  CALLING_FROM_NUMBER: optionalString,
  /** Twilio: the account SID that goes with the auth token above. */
  CALLING_ACCOUNT_SID: optionalString,
  /** Vonage: the Voice application id, and its PKCS#8 private key. */
  CALLING_APPLICATION_ID: optionalString,
  CALLING_PRIVATE_KEY: optionalString,

  // Web Push (RFC 8292). The one integration that needs no account with
  // anybody: generate the pair with `npm run vapid:keys` and it works.
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  // Who a push service should contact about this server. mailto: or https:.
  VAPID_SUBJECT: optionalString,

  // Shared secret for the scheduled-job endpoints. Without it those endpoints
  // refuse every caller rather than running unauthenticated.
  CRON_SECRET: optionalString,

  SEED_ADMIN_EMAIL: z.string().email().default('admin@islamabadfix.pk'),
  SEED_ADMIN_PASSWORD: z.string().min(10).default('ChangeMe!Admin123'),
  ALLOW_DEMO_SEED: bool(false),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nSee .env.example for the full contract.`,
    );
  }
  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Which optional integrations are actually usable. The UI reads these through
 * server components / API responses so it can show honest "not configured"
 * states instead of dead controls.
 */
export const integrations = {
  ai: {
    configured: env.AI_PROVIDER !== 'none' && Boolean(env.AI_API_KEY),
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
  },
  maps: {
    configured: env.MAPS_PROVIDER !== 'none' && Boolean(env.MAPS_API_KEY),
    provider: env.MAPS_PROVIDER,
  },
  email: {
    configured:
      (env.EMAIL_PROVIDER === 'resend' && Boolean(env.EMAIL_API_KEY)) ||
      (env.EMAIL_PROVIDER === 'smtp' && Boolean(env.SMTP_URL)),
    provider: env.EMAIL_PROVIDER,
  },
  sms: {
    // `generic` also needs the endpoint: a key with nowhere to send is not
    // configured, however set it looks.
    configured:
      (env.SMS_PROVIDER === 'generic' && Boolean(env.SMS_API_KEY && env.SMS_GATEWAY_URL)) ||
      (env.SMS_PROVIDER === 'twilio' && Boolean(env.SMS_API_KEY && env.SMS_ACCOUNT_SID)),
    provider: env.SMS_PROVIDER,
  },
  whatsapp: {
    configured: Boolean(env.WHATSAPP_API_KEY && env.WHATSAPP_PHONE_NUMBER_ID),
    // Inbound webhooks need the verify token + app secret regardless of sending.
    inboundConfigured: Boolean(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET),
  },
  voice: {
    configured: Boolean(env.VAPI_API_KEY),
    inboundConfigured: Boolean(env.VAPI_WEBHOOK_SECRET),
  },
  onlinePayments: {
    // A key with no endpoint cannot take a payment, so it is not "configured".
    configured:
      env.PAYMENT_GATEWAY !== 'none' &&
      Boolean(env.PAYMENT_API_KEY && env.PAYMENT_CHECKOUT_URL && env.PAYMENT_MERCHANT_ID),
    provider: env.PAYMENT_GATEWAY,
  },
  calling: {
    // Each provider needs more than an API key, and a half-configured bridge
    // is worse than none: it would fail at the moment someone taps "Call".
    configured: Boolean(
      env.CALLING_FROM_NUMBER &&
      ((env.CALLING_PROVIDER === 'twilio' && env.CALLING_API_KEY && env.CALLING_ACCOUNT_SID) ||
        (env.CALLING_PROVIDER === 'vonage' &&
          env.CALLING_APPLICATION_ID &&
          env.CALLING_PRIVATE_KEY)),
    ),
    provider: env.CALLING_PROVIDER,
  },
  push: {
    configured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  },
  cron: {
    configured: Boolean(env.CRON_SECRET),
  },
  storage: {
    driver: env.STORAGE_DRIVER,
    configured:
      env.STORAGE_DRIVER === 'local' ||
      Boolean(env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY && env.STORAGE_ENDPOINT),
  },
} as const;

export type IntegrationStatus = typeof integrations;

export const corsAllowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
