import type { Redis } from 'ioredis';
import type { CacheStore } from '../types.js';

export class RedisCacheStore implements CacheStore {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async reset(): Promise<void> {
    // Dangerous in prod, careful usage
    const keys = await this.redis.keys('gigalibs:cache:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
