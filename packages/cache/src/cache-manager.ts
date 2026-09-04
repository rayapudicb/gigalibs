import type { CacheStore, CacheOptions } from './types.js';
import { MemoryCacheStore } from './adapters/memory-cache.js';

export class CacheManager {
  private static instance: CacheManager;
  private store: CacheStore;
  private defaultTtl: number;
  private prefix: string;

  constructor(store?: CacheStore, options?: CacheOptions) {
    this.store = store ?? new MemoryCacheStore();
    this.defaultTtl = options?.ttlSeconds ?? 300; // 5 mins
    this.prefix = options?.namespace ? `${options.namespace}:` : 'gigalibs:cache:';
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  static setInstance(manager: CacheManager): void {
    CacheManager.instance = manager;
  }

  setStore(store: CacheStore): void {
    this.store = store;
  }

  private formatKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.store.get<T>(this.formatKey(key));
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.store.set<T>(this.formatKey(key), value, ttlSeconds ?? this.defaultTtl);
  }

  async del(key: string | string[]): Promise<void> {
    const formatted = Array.isArray(key) ? key.map((k) => this.formatKey(k)) : this.formatKey(key);
    return this.store.del(formatted);
  }

  /**
   * Wrap an async computation with cache
   */
  async wrap<T>(key: string, fn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    const fresh = await fn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}

export const cache = CacheManager.getInstance();
