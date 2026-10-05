import { pruneLoginThrottles } from '@gigalibs/auth-nest';
import { Prisma, prisma } from '@gigalibs/db';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';

@Injectable()
export class DataRetentionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DataRetentionWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  onApplicationBootstrap() {
    this.timer = setInterval(
      () => void this.tick(),
      runtimeConfig.retentionWorkerIntervalSeconds * 1_000,
    );
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const environments = await prisma.tenantEnvironment.findMany({
        where: { status: { in: ['ACTIVE', 'LOCKED', 'EXPIRED'] } },
        select: { id: true, tenantId: true, retentionDays: true },
        orderBy: { createdAt: 'asc' },
        take: runtimeConfig.retentionEnvironmentBatchSize,
      });
      for (const environment of environments) {
        try {
          await this.purgeEnvironment(environment);
        } catch (error) {
          const failureCode = error instanceof Error ? error.name.slice(0, 120) : 'UnknownError';
          try {
            await prisma.dataRetentionExecution.create({
              data: {
                tenantId: environment.tenantId,
                environmentId: environment.id,
                status: 'FAILED',
                cutoffAt: this.cutoff(environment.retentionDays),
                failureCode,
                completedAt: new Date(),
              },
            });
          } catch (evidenceError) {
            this.logger.error(
              `Retention failure evidence could not be persisted. environmentId=${environment.id} error=${
                evidenceError instanceof Error ? evidenceError.name : 'UnknownError'
              }`,
            );
          }
          this.logger.error(
            `Retention execution failed. environmentId=${environment.id} error=${failureCode}`,
          );
        }
      }
      // WI-OI-120e (U3.2): login throttle rows with no live lock or window are removed after a day.
      await pruneLoginThrottles().catch((error: unknown) =>
        this.logger.error(`Login throttle pruning failed. error=${error instanceof Error ? error.name : 'UnknownError'}`),
      );
    } finally {
      this.running = false;
    }
  }

  private async purgeEnvironment(environment: {
    id: string;
    tenantId: string;
    retentionDays: number;
  }) {
    const cutoffAt = this.cutoff(environment.retentionDays);
    return prisma.$transaction(
      async (transaction) => {
        const hold = await transaction.dataRetentionHold.findFirst({
          where: {
            tenantId: environment.tenantId,
            environmentId: environment.id,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (hold) return 0;

        const candidates = await transaction.sourceEvent.findMany({
          where: {
            tenantId: environment.tenantId,
            environmentId: environment.id,
            payloadPurgedAt: null,
            receivedAt: { lt: cutoffAt },
            status: { in: ['PROCESSED', 'REJECTED', 'QUARANTINED'] },
            operationalExceptions: { none: { status: { not: 'RESOLVED' } } },
          },
          select: { id: true },
          orderBy: { receivedAt: 'asc' },
          take: runtimeConfig.retentionEventBatchSize,
        });
        if (candidates.length === 0) return 0;

        const execution = await transaction.dataRetentionExecution.create({
          data: {
            tenantId: environment.tenantId,
            environmentId: environment.id,
            cutoffAt,
          },
        });
        const purgedAt = new Date();
        const result = await transaction.sourceEvent.updateMany({
          where: {
            id: { in: candidates.map(({ id }) => id) },
            payloadPurgedAt: null,
          },
          data: {
            payloadCiphertext: Uint8Array.from([]),
            payloadIv: Uint8Array.from([]),
            payloadAuthTag: Uint8Array.from([]),
            payloadPurgedAt: purgedAt,
          },
        });
        await transaction.dataRetentionExecution.update({
          where: { id: execution.id },
          data: {
            status: 'SUCCEEDED',
            sourceEventsPurged: result.count,
            completedAt: new Date(),
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: environment.tenantId,
            action: 'DELETE',
            resource: 'source-event-payload-retention',
            resourceId: execution.id,
            before: { payloadsAvailable: result.count, cutoffAt: cutoffAt.toISOString() },
            after: { payloadsAvailable: 0, purgedAt: purgedAt.toISOString() },
            metadata: {
              environmentId: environment.id,
              sourceEventsPurged: result.count,
              immutablePayloadHashesRetained: true,
            },
          },
        });
        return result.count;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private cutoff(retentionDays: number) {
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
  }
}
