import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMqJobAdapter } from './bullmq-adapter.js';
import type { JobRecord } from './types.js';

const redisUrl = process.env.JOBS_TEST_REDIS_URL;
const integration = describe.skipIf(!redisUrl);

integration('BullMqJobAdapter real Redis transport', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    await redis?.quit();
  });

  it('transports only the durable job id and deduplicates the same dispatch token', async () => {
    const received: string[] = [];
    let resolveReceived: (() => void) | undefined;
    const firstReceived = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('BullMQ proof timed out.')), 5_000);
      resolveReceived = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
    const adapter = new BullMqJobAdapter(redis, { concurrency: 2 });
    const job = makeJob();

    await adapter.publish(job);
    await adapter.publish(job);
    adapter.start(async (jobId) => {
      received.push(jobId);
      resolveReceived?.();
    });

    await firstReceived;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await adapter.close();

    expect(received).toEqual([job.id]);
  });
});

function makeJob(): JobRecord {
  const now = new Date();
  return {
    id: randomUUID(),
    tenantId: 'tenant-proof',
    jobType: 'analytics.summary-build',
    jobVersion: 1,
    backend: 'BULLMQ',
    status: 'QUEUED',
    payload: { secretMustNotReachRedis: 'proof' },
    payloadSha256: 'a'.repeat(64),
    ownerSubjectId: 'user-proof',
    ownerAuthVersion: 1,
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    maxAttempts: 3,
    attempts: 0,
    backoffBaseMs: 100,
    backoffMaxMs: 1_000,
    availableAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    dispatchStatus: 'PENDING',
    dispatchAttempts: 0,
    dispatchedAt: null,
    dispatchLastError: null,
    resultSummary: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    auditSequence: 1,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
}
