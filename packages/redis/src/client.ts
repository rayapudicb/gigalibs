import Redis, { type RedisOptions } from 'ioredis';
import { logger } from '@gigalibs/logger';

declare global {
  // eslint-disable-next-line no-var
  var __gigalibsRedis: Redis | undefined;
  // eslint-disable-next-line no-var
  var __gigalibsRedisSub: Redis | undefined;
}

const defaultOptions: RedisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
  lazyConnect: false,
};

function attachEvents(client: Redis, name: string): void {
  client.on('connect', () => logger.info(`[${name}] Redis connected`));
  client.on('ready', () => logger.debug(`[${name}] Redis ready`));
  client.on('error', (err: Error) => logger.error({ err }, `[${name}] Redis error`));
  client.on('close', () => logger.warn(`[${name}] Redis connection closed`));
  client.on('reconnecting', () => logger.info(`[${name}] Redis reconnecting…`));
}

/**
 * Create (or reuse) the main Redis client.
 * Used for cache, rate limiting, session store, etc.
 */
export function createRedisClient(url?: string, options?: RedisOptions): Redis {
  if (globalThis.__gigalibsRedis) return globalThis.__gigalibsRedis;
  const redisUrl = resolveRedisUrl(url);
  const client = new Redis(redisUrl, { ...defaultOptions, ...options });
  attachEvents(client, 'Main');
  globalThis.__gigalibsRedis = client;
  return client;
}

/**
 * Create a dedicated subscriber Redis client (must not share with regular client).
 * Used for pub/sub subscriptions.
 */
export function createRedisSubscriber(url?: string, options?: RedisOptions): Redis {
  if (globalThis.__gigalibsRedisSub) return globalThis.__gigalibsRedisSub;
  const redisUrl = resolveRedisUrl(url);
  const client = new Redis(redisUrl, { ...defaultOptions, ...options });
  attachEvents(client, 'Sub');
  globalThis.__gigalibsRedisSub = client;
  return client;
}

/** Convenience singleton accessors */
export const redis = (): Redis => createRedisClient();
export const redisSub = (): Redis => createRedisSubscriber();

function resolveRedisUrl(explicitUrl?: string): string {
  const value = explicitUrl?.trim() || process.env['REDIS_URL']?.trim();
  if (!value) {
    throw new Error('REDIS_URL must be configured before creating a Redis client.');
  }

  const parsed = new URL(value);
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('REDIS_URL must be an absolute redis:// or rediss:// URL.');
  }
  return value;
}

export const disconnectRedis = async (): Promise<void> => {
  await globalThis.__gigalibsRedis?.quit();
  await globalThis.__gigalibsRedisSub?.quit();
  logger.info('Redis connections closed');
};

export type { Redis, RedisOptions };
