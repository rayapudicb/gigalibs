/**
 * Kernel worker (WI-OI-104c, ADR-0017): one process that turns due schedules into jobs and runs jobs. PostgreSQL is
 * the durable truth; when REDIS_URL is set, BULLMQ jobs are dispatched through Redis, which carries only job ids.
 * Runs as its own Compose service from the core API image (`node dist/kernel-worker/main.js`).
 */

import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { AuthService } from '@gigalibs/auth-nest';
import {
  BullMqJobAdapter,
  JobRegistry,
  KernelJobs,
  KernelScheduler,
  PostgresJobStore,
  PostgresScheduleStore,
} from '@gigalibs/jobs';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { isOwnerRefusal, moduleCallJob } from './module-call.job.js';

const interval = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 250 || value > 600_000) throw new Error(`${name} must be 250–600000 ms.`);
  return value;
};

export async function startKernelWorker(): Promise<() => Promise<void>> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const workerId = `kernel-worker:${hostname()}:${process.pid}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const auth = new AuthService();
  const registry = new JobRegistry();
  registry.register(moduleCallJob(auth));

  const redisUrl = process.env.REDIS_URL?.trim();
  const redis = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: null }) : undefined;
  const bullMq = redis ? new BullMqJobAdapter(redis) : undefined;
  const jobs = new KernelJobs({
    store: new PostgresJobStore(pool),
    registry,
    ...(bullMq ? { bullMq } : {}),
  });
  const scheduler = new KernelScheduler({
    store: new PostgresScheduleStore(pool),
    jobs,
    registry,
    // The owner must still be an active member; the auth version is that of a fresh context. Only an auth refusal
    // pauses the schedule: any other failure ends the tick, and the schedule is tried again on the next one.
    resolveOwner: async (tenantId, subjectId) => {
      try {
        const context = await auth.getSubjectContext(subjectId, tenantId, `schedule-check:${subjectId}`);
        return { authVersion: context.authVersion };
      } catch (error) {
        if (isOwnerRefusal(error)) return null;
        throw error;
      }
    },
  });
  if (redis) jobs.startBullMqWorker(workerId);

  let stopping = false;
  let lastTickAt = Date.now();
  const tickMs = interval('KERNEL_WORKER_TICK_MS', 5_000);
  const loop = async () => {
    while (!stopping) {
      try {
        await scheduler.tick();
        if (redis) await jobs.dispatchPendingBullMq();
        // Drain ready PostgreSQL jobs, a bounded number per tick so schedules keep flowing.
        for (let ran = 0; ran < 20 && !stopping; ran += 1) {
          if (!(await jobs.runNextPostgres(workerId))) break;
        }
        lastTickAt = Date.now();
      } catch (error) {
        console.error(`[kernel-worker] tick failed: ${(error as Error).message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, tickMs));
    }
  };
  const running = loop();

  // Health: ready while the loop has completed a tick within five intervals. Loopback only: the healthcheck runs in the container.
  const health = createServer((request, response) => {
    const healthy = Date.now() - lastTickAt < tickMs * 5 + 30_000;
    response.writeHead(request.url === '/health' && healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: healthy ? 'ok' : 'stalled', workerId }));
  });
  health.listen(Number(process.env.KERNEL_WORKER_HEALTH_PORT ?? 4800), '127.0.0.1');
  console.log(`[kernel-worker] ${workerId} started (tick ${tickMs} ms, BullMQ ${redis ? 'on' : 'off'})`);

  return async () => {
    stopping = true;
    await running;
    health.close();
    await bullMq?.close();
    await redis?.quit();
    await pool.end();
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startKernelWorker()
    .then((stop) => {
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => {
          console.log(`[kernel-worker] ${signal}: finishing the current tick`);
          void stop().then(() => process.exit(0));
        });
      }
    })
    .catch((error: Error) => {
      console.error(`[kernel-worker] failed to start: ${error.message}`);
      process.exit(1);
    });
}
