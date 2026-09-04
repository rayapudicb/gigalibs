/**
 * @gigalibs/broker
 *
 * Message broker abstraction with pluggable adapters.
 * Default: Redis Pub/Sub (zero extra infra).
 * Optional: RabbitMQ, Kafka (swap by changing adapter in forRoot()).
 *
 * Usage:
 *   broker.publish('user.created', { userId, tenantId })
 *   broker.subscribe('user.created', async (payload) => { ... })
 *
 * @module
 */

export * from './broker.js';
export * from './adapters/redis-adapter.js';
export * from './types.js';
