/**
 * @gigalibs/queue
 *
 * BullMQ wrapper. Type-safe job definitions. Worker factory.
 * Dead-letter queue. Retry/backoff policies.
 *
 * @module
 */

export * from './queue-factory.js';
export * from './worker-factory.js';
export * from './job-types.js';
export type { Queue, Worker, Job, JobsOptions } from 'bullmq';
