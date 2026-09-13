import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { invalidateSettingsCache } from '@/lib/settings';

/**
 * Per-file setup.
 *
 * The database is truncated before each file runs, so tests are order
 * independent and a failure cannot leave rows that break the next file.
 */
const url =
  process.env.TEST_DATABASE_URL ??
  'postgresql://isbfix:isbfix@localhost:5432/isbfix_test?schema=public';

process.env.DATABASE_URL = url;
// `NODE_ENV` is typed read-only by next-env.d.ts; the tests genuinely do need
// to set it before anything reads it.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.AUTH_SECRET ??= 'test-secret-at-least-thirty-two-characters-long';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
// Keep every optional integration off, so tests exercise the honest
// "not configured" paths rather than reaching the network.
process.env.AI_PROVIDER = 'none';
process.env.MAPS_PROVIDER = 'none';
process.env.EMAIL_PROVIDER = 'none';
process.env.PAYMENT_GATEWAY = 'none';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = './storage-test';

const prisma = new PrismaClient({ datasources: { db: { url } } });

export async function truncateAll(): Promise<void> {
  // One statement so foreign keys never block the reset. Setting goes too, so
  // every test starts from the shipped defaults and seeds only what it needs.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "Notification", "Message", "ConversationParticipant", "Conversation",
      "SupportTicket", "GuaranteeClaim", "Dispute", "Review", "PayoutItem", "Payout",
      "Payment", "QuoteItem", "Quote", "BookingOffer", "BookingStatusHistory",
      "MembershipBenefit", "MembershipPayment", "Membership", "MembershipPlan",
      "RecurringSchedule", "Booking",
      "UploadedFile", "Address", "ServiceArea", "ProviderAvailability", "ProviderLocation",
      "ProviderService", "ProviderVerification", "ProviderProfile", "CustomerProfile",
      "PushSubscription",
      "RefreshToken", "User", "Service", "ServiceCategory", "ServiceZone", "PromoCode",
      "RateLimitHit", "Setting"
    RESTART IDENTITY CASCADE
  `);
  // Setting rows are gone, so every cached value is now wrong. Drop the cache
  // rather than let a 15-second TTL leak configuration across tests.
  invalidateSettingsCache();
}

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
