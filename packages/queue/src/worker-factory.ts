import { Worker, type Processor } from 'bullmq';
import type { Redis } from 'ioredis';
import { logger } from '@gigalibs/logger';

/**
 * Create a BullMQ Worker with standard logging and error handling.
 *
 * @example
 * const worker = createWorker(Queues.EMAIL, redisClient, async (job) => {
 *   const { to, subject, html } = job.data as EmailJob;
 *   await emailProvider.send({ to, subject, html });
 * });
 */
export function createWorker<T = unknown>(
  queueName: string,
  redis: Redis,
  processor: Processor<T>,
  concurrency = 5,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: redis,
    concurrency,
    // Graceful shutdown: wait up to 30s for in-flight jobs
    drainDelay: 5,
  });

  worker.on('completed', (job) => {
    logger.debug({ queue: queueName, jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err: Error) => {
    logger.error(
      { queue: queueName, jobId: job?.id, attempt: job?.attemptsMade, err },
      'Job failed',
    );
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn({ queue: queueName, jobId }, 'Job stalled');
  });

  worker.on('error', (err: Error) => {
    logger.error({ queue: queueName, err }, 'Worker error');
  });

  logger.info({ queue: queueName, concurrency }, 'Worker started');
  return worker;
}
