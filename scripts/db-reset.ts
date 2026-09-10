/**
 * Drop and rebuild the development database, then re-seed.
 *
 * Refuses to run when NODE_ENV is production, and refuses without --confirm.
 * There is deliberately no flag that makes this work against production: a
 * production reset should be a deliberate, manual, backed-up operation.
 */
import { execSync } from 'child_process';

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  fail('Refusing to reset the database with NODE_ENV=production.');
}

const url = process.env.DATABASE_URL ?? '';
// A crude but effective guard against pointing this at a managed database.
const looksRemote =
  /amazonaws|azure|gcp|neon\.tech|supabase|render\.com|railway|planetscale/i.test(url);
if (looksRemote && !process.argv.includes('--i-really-mean-it')) {
  fail(
    'DATABASE_URL looks like a hosted database. Refusing to reset it.\n' +
      'If this really is a throwaway environment, pass --i-really-mean-it.',
  );
}

if (!process.argv.includes('--confirm')) {
  console.info('This will DROP every table and re-create the schema, destroying all data.');
  console.info(`Target: ${url.replace(/:[^:@/]*@/, ':****@')}`);
  console.info('\nRe-run with --confirm to proceed.');
  process.exit(0);
}

console.info('Resetting database...');
execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit' });
console.info('\nSeeding...');
execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
console.info('\nDone.');
