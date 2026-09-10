/**
 * Remove every row created by the demo seed.
 *
 * Destructive, so it requires explicit confirmation:
 *   npx tsx scripts/purge-demo.ts --confirm
 *
 * Only touches rows flagged isDemo=true. Real customer, provider and booking
 * data is never matched by these queries.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm')) {
    const [users, providers, bookings, reviews] = await Promise.all([
      prisma.user.count({ where: { isDemo: true } }),
      prisma.providerProfile.count({ where: { isDemo: true } }),
      prisma.booking.count({ where: { isDemo: true } }),
      prisma.review.count({ where: { isDemo: true } }),
    ]);
    console.info('Demo data currently in the database:');
    console.info(`  users: ${users}`);
    console.info(`  provider profiles: ${providers}`);
    console.info(`  bookings: ${bookings}`);
    console.info(`  reviews: ${reviews}`);
    console.info('\nNothing was deleted. Re-run with --confirm to remove these rows.');
    return;
  }

  // Bookings first: their quotes, payments, reviews and history cascade.
  const bookings = await prisma.booking.deleteMany({ where: { isDemo: true } });
  const providers = await prisma.providerProfile.deleteMany({ where: { isDemo: true } });
  const users = await prisma.user.deleteMany({ where: { isDemo: true } });

  console.info('Demo data removed:');
  console.info(`  bookings: ${bookings.count}`);
  console.info(`  provider profiles: ${providers.count}`);
  console.info(`  users: ${users.count}`);
  console.info('\nCatalogue, zones and settings were left in place.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Purge failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
