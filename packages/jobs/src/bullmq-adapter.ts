import { type JobsOptions, Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { BullMqDispatchAdapter, JobRecord } from './types.js';

interface KernelBullJob {
  readonly jobId: string;
}

export const KERNEL_BULLMQ_QUEUE_NAME = 'gigalibs-kernel-jobs';

export interface BullMqAdapterOptions {
  readonly queueName?: string;
  readonly concurrency?: number;
}

/**
 * Redis/BullMQ carries only a job id. Payload, authorization identity, attempts,
 * retry state and audit remain in PostgreSQL.
 */
export class BullMqJobAdapter implements BullMqDispatchAdapter {
  readonly #queue: Queue<KernelBullJob>;
  readonly #redis: Redis;
  readonly #queueName: string;
  readonly #concurrency: number;
  #worker: Worker<KernelBullJob> | null = null;

  constructor(redis: Redis, options: BullMqAdapterOptions = {}) {
    this.#redis = redis;
    this.#queueName = options.queueName ?? KERNEL_BULLMQ_QUEUE_NAME;
    this.#concurrency = options.concurrency ?? 5;
    if (
      !Number.isSafeInteger(this.#concurrency) ||
      this.#concurrency < 1 ||
      this.#concurrency > 100
    ) {
      throw new Error('BullMQ job concurrency must be between 1 and 100.');
    }
    this.#queue = new Queue<KernelBullJob>(this.#queueName, {
      connection: redis,
      defaultJobOptions: bullJobOptions(),
    });
  }

  async publish(job: JobRecord): Promise<void> {
    if (job.backend !== 'BULLMQ') throw new Error(`Job '${job.id}' is not assigned to BullMQ.`);
    const delay = Math.max(0, job.availableAt.getTime() - Date.now());
    // A stable token deduplicates concurrent dispatchers. The next durable retry changes attempts/dispatchAttempts.
    const transientId = `${job.id}-${job.attempts}-${job.dispatchAttempts}`;
    await this.#queue.add(
      job.jobType,
      { jobId: job.id },
      { ...bullJobOptions(), delay, jobId: transientId },
    );
  }

  start(processor: (jobId: string) => Promise<void>): void {
    if (this.#worker) throw new Error('The BullMQ kernel job worker is already running.');
    this.#worker = new Worker<KernelBullJob>(
      this.#queueName,
      async (job) => processor(job.data.jobId),
      {
        connection: this.#redis,
        concurrency: this.#concurrency,
      },
    );
  }

  async close(): Promise<void> {
    await this.#worker?.close();
    this.#worker = null;
    await this.#queue.close();
  }
}

function bullJobOptions(): JobsOptions {
  return {
    // These retries cover Redis/worker infrastructure errors only. Business retries are durable in PostgreSQL.
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 604_800, count: 5_000 },
  };
}
