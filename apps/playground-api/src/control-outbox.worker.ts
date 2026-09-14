import { Prisma, prisma } from '@gigalibs/db';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ApIngestionService } from './ap-ingestion.service.js';
import { runtimeConfig } from './config/runtime-config.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ExceptionService } from './exception.service.js';

interface ClaimedOutboxEvent {
  id: string;
  eventId: string;
  tenantId: string;
  aggregateId: string;
  eventType: string;
  attempts: number;
}

@Injectable()
export class ControlOutboxWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ControlOutboxWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  constructor(
    private readonly ingestionService: ApIngestionService,
    private readonly exceptionService: ExceptionService,
  ) {}

  onApplicationBootstrap() {
    const intervalMs = runtimeConfig.controlOutboxPollIntervalSeconds * 1_000;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      await Promise.allSettled(claimed.map((event) => this.process(event)));
    } catch (error) {
      this.logger.error(
        'Control outbox polling failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private claimBatch() {
    const staleBefore = new Date(
      Date.now() - runtimeConfig.controlOutboxClaimTimeoutSeconds * 1_000,
    );
    return prisma.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "control_outbox_events"
        WHERE
          (
            "status" = 'PENDING'
            AND "availableAt" <= NOW()
          )
          OR (
            "status" = 'PROCESSING'
            AND "claimedAt" < ${staleBefore}
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${runtimeConfig.controlOutboxBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "control_outbox_events" AS outbox
      SET
        "status" = 'PROCESSING',
        "claimedAt" = NOW(),
        "attempts" = outbox."attempts" + 1
      FROM candidates
      WHERE outbox."id" = candidates."id"
      RETURNING
        outbox."id",
        outbox."eventId",
        outbox."tenantId",
        outbox."aggregateId",
        outbox."eventType",
        outbox."attempts"
    `);
  }

  private async process(event: ClaimedOutboxEvent) {
    try {
      if (event.eventType === 'operational.source-event.validated.v1') {
        await prisma.sourceEvent.updateMany({
          where: {
            id: event.aggregateId,
            tenantId: event.tenantId,
            status: { in: ['VALIDATED', 'PROCESSING'] },
          },
          data: { status: 'PROCESSING' },
        });
        await this.ingestionService.processSourceEvent(event.aggregateId);
        await prisma.$transaction(async (transaction) => {
          const sourceEvent = await transaction.sourceEvent.update({
            where: { id: event.aggregateId },
            data: { status: 'PROCESSED', processedAt: new Date() },
            select: { id: true, tenantId: true, eventId: true },
          });
          await transaction.controlOutboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              claimedAt: null,
              lastErrorCode: null,
            },
          });
          await this.exceptionService.recordProcessingSuccess(transaction, sourceEvent);
        });
      } else if (
        event.eventType.startsWith('configuration.') ||
        event.eventType.startsWith('saga.') ||
        event.eventType.startsWith('webhook.')
      ) {
        // Mark generic configuration, saga, or webhook events as published
        await prisma.controlOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            claimedAt: null,
            lastErrorCode: null,
          },
        });
        this.logger.log(`Dispatched generic outbox event: ${event.eventType} (${event.id})`);
      } else {
        throw new Error('UNSUPPORTED_CONTROL_OUTBOX_EVENT');
      }
    } catch (error) {
      await this.recordFailure(event, this.errorCode(error));
    }
  }

  private async recordFailure(event: ClaimedOutboxEvent, errorCode: string) {
    const terminal =
      this.isPermanentFailure(errorCode) ||
      event.attempts >= runtimeConfig.controlOutboxMaxAttempts;
    const exponent = Math.max(0, event.attempts - 1);
    const retrySeconds = Math.min(
      runtimeConfig.controlOutboxRetryMaxSeconds,
      runtimeConfig.controlOutboxRetryBaseSeconds * 2 ** exponent,
    );
    const availableAt = new Date(Date.now() + retrySeconds * 1_000);

    await prisma.$transaction(async (transaction) => {
      await transaction.controlOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: terminal ? 'FAILED' : 'PENDING',
          availableAt,
          claimedAt: null,
          lastErrorCode: errorCode,
        },
      });
      if (terminal) {
        const sourceEvent = await transaction.sourceEvent.update({
          where: { id: event.aggregateId, tenantId: event.tenantId },
          data: {
            status: 'QUARANTINED',
            rejectionCode: 'CANONICAL_PROCESSING_FAILED',
            rejectionDetail: {
              processor: 'ap-canonical-ingestion',
              errorCode,
              attempts: event.attempts,
            },
            processedAt: new Date(),
          },
          select: {
            id: true,
            tenantId: true,
            environmentId: true,
            eventId: true,
            eventType: true,
            classification: true,
          },
        });
        await this.exceptionService.recordProcessingFailure(
          transaction,
          sourceEvent,
          errorCode,
          event.attempts,
        );
        await this.exceptionService.recordRecoveryFailure(transaction, sourceEvent, errorCode);
        await transaction.auditLog.create({
          data: {
            tenantId: event.tenantId,
            action: 'STATUS_CHANGE',
            resource: 'source-event',
            resourceId: event.aggregateId,
            after: {
              status: 'QUARANTINED',
              outboxEventId: event.eventId,
              errorCode,
              attempts: event.attempts,
            },
          },
        });
      }
    });
    const message = terminal
      ? 'Control outbox event quarantined.'
      : 'Control outbox event scheduled for retry.';
    this.logger.warn(
      `${message} eventId=${event.eventId} code=${errorCode} attempts=${event.attempts}`,
    );
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)) {
      return error.message;
    }
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code);
      if (/^[A-Z0-9_]{2,100}$/.test(code)) return `PERSISTENCE_${code}`;
    }
    return 'CANONICAL_PROCESSING_ERROR';
  }

  private isPermanentFailure(errorCode: string): boolean {
    return (
      errorCode === 'SOURCE_EVENT_NOT_FOUND' ||
      errorCode === 'UNSUPPORTED_CONTROL_OUTBOX_EVENT' ||
      /_(?:PAYLOAD_INVALID|LINE_DUPLICATE|BUSINESS_KEY_CONFLICT)$/.test(errorCode)
    );
  }
}
