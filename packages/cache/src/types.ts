export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string | string[]): Promise<void>;
  reset(): Promise<void>;
}

export interface CacheOptions {
  ttlSeconds?: number;
  namespace?: string;
}
