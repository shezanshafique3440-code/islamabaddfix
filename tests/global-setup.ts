import { execSync } from 'child_process';

/**
 * Test database bootstrap.
 *
 * Runs once before the suite: points DATABASE_URL at a dedicated test database
 * and applies migrations. A separate database is non-negotiable — these tests
 * truncate tables between files, and pointing that at a development database
 * would destroy someone's work.
 */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://isbfix:isbfix@localhost:5432/isbfix_test?schema=public';

  if (!/test/i.test(url)) {
    throw new Error(
      `Refusing to run tests against "${url.replace(/:[^:@/]*@/, ':****@')}" — ` +
        'the database name must contain "test". Set TEST_DATABASE_URL.',
    );
  }

  process.env.DATABASE_URL = url;
  // `NODE_ENV` is typed read-only by next-env.d.ts; the tests genuinely do
  // need to set it before anything reads it.
  (process.env as Record<string, string>).NODE_ENV = 'test';

  // Create the database if it is not there yet, then bring the schema up to date.
  const admin = url.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  try {
    execSync(
      `psql "${admin}" -tc "SELECT 1 FROM pg_database WHERE datname = '${databaseName(url)}'" | grep -q 1 || psql "${admin}" -c "CREATE DATABASE ${databaseName(url)}"`,
      { stdio: 'pipe', shell: '/bin/bash' },
    );
  } catch {
    // psql may be unavailable; migrate deploy will surface a clearer error.
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}

function databaseName(url: string): string {
  const match = /\/([^/?]+)(\?|$)/.exec(url);
  return match?.[1] ?? 'isbfix_test';
}
