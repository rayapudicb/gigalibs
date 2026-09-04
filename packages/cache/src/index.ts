/**
 * @gigalibs/cache
 *
 * Cache abstraction layer with Redis and in-memory adapters.
 * Includes @Cacheable() decorator and cache invalidation utilities.
 *
 * @module
 */

export * from './cache-manager.js';
export * from './adapters/redis-cache.js';
export * from './adapters/memory-cache.js';
export * from './decorators.js';
export * from './types.js';
