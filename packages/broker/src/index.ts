/**
 * @gigalibs/broker
 *
 * Enterprise Message broker abstraction with multi-tenant isolation.
 * - Redis: In-memory distributed lock (Redlock), rate-limiting, session state.
 * - RabbitMQ: AMQP 0-9-1 virtual host isolation, point-to-point task queues, DLX.
 * - Kafka: Append-only immutable event streams, temporal replay, FIPS SHA-256 seals.
 *
 * @module
 */

export * from './broker.js';
export * from './adapters/redis-adapter.js';
export * from './adapters/rabbitmq-adapter.js';
export * from './adapters/kafka-adapter.js';
export * from './multi-tenant-manager.js';
export * from './types.js';
