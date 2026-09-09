import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env';

/**
 * Prisma singleton. Next's dev server re-evaluates modules on every change, so
 * without the global cache we would exhaust Postgres connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProduction) globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
/** Either the base client or an interactive transaction client. */
export type DbClient = PrismaClient | Tx;
