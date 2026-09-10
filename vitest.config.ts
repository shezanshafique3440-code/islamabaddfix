import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const alias = { '@': resolve(__dirname, './src') };

/**
 * Two test projects, because they need different worlds.
 *
 *  - `server` runs against a real PostgreSQL database (see tests/global-setup),
 *    serially, because the files share it and truncate between them.
 *  - `ui` renders components in jsdom. No database, so it stays fast and can
 *    run in parallel.
 */
export default defineConfig({
  test: {
    // Applies to every project: bring the test database up to date once.
    globalSetup: ['tests/global-setup.ts'],
    // Root-level, not per-project: the server tests share one database and
    // truncate between files, so nothing may run alongside them. Vitest only
    // honours this at the root, and the ui project is fast enough that serial
    // execution costs nothing.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/ui/**'],
          setupFiles: ['tests/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        resolve: { alias },
        // next.config sets `jsx: "preserve"` for the Next compiler; the test
        // transform has no such compiler behind it and needs the automatic
        // runtime.
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.tsx'],
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
    ],
  },
});
