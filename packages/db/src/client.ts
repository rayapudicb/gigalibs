try {
  process.loadEnvFile?.('.env');
} catch {}
try {
  process.loadEnvFile?.('../../.env');
} catch {}
import { logger } from '@gigalibs/logger';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────

declare global {
  // Prevent multiple Prisma instances in hot-reload dev environments
  // eslint-disable-next-line no-var
  var __gigalibsPrisma: PrismaClient | undefined;
}

/**
 * Create a Prisma client with query logging in development.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = requireDatabaseUrl();

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
  });

  if (process.env.NODE_ENV === 'development') {
    client.$on('query', (e: { query: string; duration: number }) => {
      if (e.duration > 100) {
        logger.warn({ query: e.query, duration: e.duration }, 'Slow query detected (>100ms)');
      } else {
        logger.debug({ duration: e.duration }, 'DB query');
      }
    });
  }

  client.$on('warn', (e: { message: string }) => logger.warn(e.message));
  client.$on('error', (e: { message: string }) => logger.error(e.message));

  return client;
}

function requireDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) {
    throw new Error('DATABASE_URL must be configured.');
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  return configured;
}

/**
 * Global Prisma singleton — shared across all modules in the same process.
 * In production, this is created once on startup.
 * In development, uses global to survive hot reloads.
 */
const prismaClient = globalThis.__gigalibsPrisma ?? createPrismaClient();
globalThis.__gigalibsPrisma = prismaClient;
export const prisma: PrismaClient = prismaClient;

/**
 * Gracefully disconnect Prisma on process shutdown.
 * Call this in your NestJS onModuleDestroy or process exit handler.
 */
export const disconnectDb = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info('Database connection closed');
};
