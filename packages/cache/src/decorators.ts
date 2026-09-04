import { CacheManager } from './cache-manager.js';

/**
 * Cacheable method decorator. Automatically caches method return values based on key template.
 *
 * @example
 * class UserService {
 *   @Cacheable('user:{0}', 600)
 *   async getUserById(id: string) {
 *     return db.user.findUnique({ where: { id } });
 *   }
 * }
 */
export function Cacheable(keyPattern: string, ttlSeconds?: number) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      let key = keyPattern;
      args.forEach((arg, index) => {
        key = key.replace(`{${index}}`, String(arg));
      });

      const cache = CacheManager.getInstance();
      const cached = await cache.get(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      if (result !== null && result !== undefined) {
        await cache.set(key, result, ttlSeconds);
      }
      return result;
    };

    return descriptor;
  };
}

/**
 * CacheEvict method decorator. Invalidates cache keys on successful execution.
 */
export function CacheEvict(keyPattern: string) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const result = await originalMethod.apply(this, args);
      let key = keyPattern;
      args.forEach((arg, index) => {
        key = key.replace(`{${index}}`, String(arg));
      });

      const cache = CacheManager.getInstance();
      await cache.del(key);
      return result;
    };

    return descriptor;
  };
}
