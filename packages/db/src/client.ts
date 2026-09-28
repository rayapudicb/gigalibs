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

  // Keep every ORM connection on UTC. This also protects legacy module fields
  // that still use `timestamp without time zone` until their domain owners
  // classify and migrate them, and prevents native-driver serialization from
  // depending on the PostgreSQL host timezone.
  const adapter = new PrismaPg({ connectionString, options: '-c timezone=UTC' });
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

let _prismaClient: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (!_prismaClient) {
    _prismaClient = globalThis.__gigalibsPrisma ?? createPrismaClient();
    globalThis.__gigalibsPrisma = _prismaClient;
  }
  return _prismaClient;
}

/**
 * Global Prisma singleton — shared across all modules in the same process.
 * Lazy-initialized via Proxy so importing @gigalibs/db during build-time (e.g. Next.js page collection)
 * does not require DATABASE_URL until actual database operations are performed.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Gracefully disconnect Prisma on process shutdown.
 * Call this in your NestJS onModuleDestroy or process exit handler.
 */
export const disconnectDb = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info('Database connection closed');
};
