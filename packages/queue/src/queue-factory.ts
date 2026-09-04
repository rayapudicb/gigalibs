import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { logger } from '@gigalibs/logger';

type GigaQueue<T> = Queue<T, unknown, string, T, unknown, string>;

const queues = new Map<string, GigaQueue<unknown>>();

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000, age: 86400 },   // keep last 1k completed jobs for 1 day
  removeOnFail: { count: 5000, age: 604800 },       // keep last 5k failed jobs for 7 days
};

/**
 * Create or retrieve a typed BullMQ Queue.
 * Queues are singletons — calling this twice with same name returns same instance.
 *
 * @example
 * const emailQueue = createQueue(Queues.EMAIL, redisClient);
 * await emailQueue.add('send', { to, subject, html }, { delay: 0 });
 */
export function createQueue<T = unknown>(name: string, redis: Redis): GigaQueue<T> {
  if (queues.has(name)) return queues.get(name) as GigaQueue<T>;

  const queue = new Queue<T, unknown, string, T, unknown, string>(name, {
    connection: redis,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  queue.on('error', (err: Error) => logger.error({ err, queue: name }, 'Queue error'));

  queues.set(name, queue as GigaQueue<unknown>);
  logger.debug({ queue: name }, 'Queue created');
  return queue;
}

/**
 * Add a job to a named queue.
 * Convenience wrapper with built-in logging.
 */
export async function enqueue<T>(
  queue: GigaQueue<T>,
  jobName: string,
  data: T,
  options?: JobsOptions,
): Promise<string> {
  const job = await queue.add(jobName, data, { ...DEFAULT_JOB_OPTIONS, ...options });
  logger.debug({ queue: queue.name, jobId: job.id, jobName }, 'Job enqueued');
  if (!job.id) throw new Error(`Queue ${queue.name} did not return a job ID for ${jobName}.`);
  return job.id;
}

/**
 * Close all queue connections gracefully.
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  logger.info('All queues closed');
}
