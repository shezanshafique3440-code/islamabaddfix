/**
 * Release step.
 *
 * Runs once on every boot, before the server starts, because that is the only
 * hook a free Render instance gives you — there is no shell and no pre-deploy
 * command on that plan.
 *
 * Two things happen here, in order:
 *
 *   1. `prisma migrate deploy` — applies any migration the running image does
 *      not have yet. It never generates, never resets, and never touches data
 *      a migration does not touch. If it fails the process exits non-zero and
 *      the deploy is rejected, which is the correct outcome: a server running
 *      against a schema it was not built for corrupts data quietly.
 *
 *   2. The seed, but only when SEED_ON_BOOT is explicitly "true". The seed is
 *      idempotent (it upserts), and the demo rows behind ALLOW_DEMO_SEED are
 *      all flagged `isDemo` so the interface can label them. Leave SEED_ON_BOOT
 *      unset on anything with real customers on it.
 *
 * Nothing here deletes a database or drops a table. There is deliberately no
 * flag that would.
 */
import { spawnSync } from 'node:child_process';

/** Run a command, inheriting stdio, and abort the boot if it fails. */
function run(label, command, args) {
  console.info(`\n▶ ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });

  if (result.error) {
    console.error(`✖ ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`✖ ${label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.info(`✔ ${label}`);
}

if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL is not set. Nothing can run without it.');
  process.exit(1);
}

run('Applying database migrations', 'npx', ['--no-install', 'prisma', 'migrate', 'deploy']);

const seedRequested = process.env.SEED_ON_BOOT === 'true' || process.env.SEED_ON_BOOT === '1';

if (seedRequested) {
  run('Seeding catalogue, zones and the admin account', 'npx', [
    '--no-install',
    'tsx',
    'prisma/seed.ts',
  ]);
  console.info(
    '\nSEED_ON_BOOT is on. The seed only ever updates rows in place, but once the\n' +
      'database is set up you can set it to false and save the time on every boot.',
  );
} else {
  console.info('\n· SEED_ON_BOOT is not "true" — skipping the seed.');
}

console.info('\nRelease step complete. Starting the server.\n');
