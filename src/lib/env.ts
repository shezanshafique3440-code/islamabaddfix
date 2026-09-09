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

  SMS_PROVIDER: z.enum(['none', 'generic']).default('none'),
  SMS_API_KEY: optionalString,
  SMS_SENDER_ID: z.string().default('ISBFIX'),

  VAPI_API_KEY: optionalString,
  VAPI_WEBHOOK_SECRET: optionalString,

  PAYMENT_GATEWAY: z.enum(['none', 'generic']).default('none'),
  PAYMENT_API_KEY: optionalString,
  PAYMENT_WEBHOOK_SECRET: optionalString,

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
    configured: env.SMS_PROVIDER !== 'none' && Boolean(env.SMS_API_KEY),
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
    configured: env.PAYMENT_GATEWAY !== 'none' && Boolean(env.PAYMENT_API_KEY),
    provider: env.PAYMENT_GATEWAY,
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
