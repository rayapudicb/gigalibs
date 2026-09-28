import { Prisma, prisma } from '@gigalibs/db';
import { Injectable, Logger } from '@nestjs/common';

export interface InboxMessageInput {
  tenantId: string;
  consumerGroup: string;
  messageId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown> | unknown[];
}

export interface ProcessInboxMessageResult<T = void> {
  status: 'PROCESSED' | 'DEDUPLICATED' | 'FAILED' | 'DEAD_LETTER';
  result?: T;
  error?: string;
}

@Injectable()
export class TransactionalInboxService {
  private readonly logger = new Logger(TransactionalInboxService.name);

  /**
   * Idempotently ingests and processes an incoming message under a tenant and consumer group.
   * If the message is already PROCESSED, returns status 'DEDUPLICATED' immediately.
   */
  async handleMessage<T>(
    input: InboxMessageInput,
    handler: () => Promise<T>,
  ): Promise<ProcessInboxMessageResult<T>> {
    const { tenantId, consumerGroup, messageId, eventType, aggregateType, aggregateId, payload } =
      input;

    // 1. Check existing inbox record
    const existing = await prisma.platformInboxEvent.findUnique({
      where: {
        tenantId_consumerGroup_messageId: {
          tenantId,
          consumerGroup,
          messageId,
        },
      },
    });

    if (existing?.status === 'PROCESSED') {
      this.logger.debug(
        `Deduplicated event ${messageId} for consumer ${consumerGroup} on tenant ${tenantId}.`,
      );
      return { status: 'DEDUPLICATED' };
    }

    if (existing?.status === 'DEAD_LETTER') {
      this.logger.warn(
        `Rejected dead-lettered event ${messageId} for consumer ${consumerGroup} on tenant ${tenantId}.`,
      );
      return { status: 'DEAD_LETTER', error: existing.lastError ?? 'DEAD_LETTER_EVENT' };
    }

    // 2. Insert or mark state as PROCESSING with heartbeat
    const now = new Date();
    const inboxRecord = existing
      ? await prisma.platformInboxEvent.update({
          where: { id: existing.id },
          data: {
            status: 'PROCESSING',
            attempts: { increment: 1 },
            heartbeatAt: now,
            updatedAt: now,
          },
        })
      : await prisma.platformInboxEvent.create({
          data: {
            tenantId,
            consumerGroup,
            messageId,
            eventType,
            aggregateType: aggregateType ?? null,
            aggregateId: aggregateId ?? null,
            payload: (payload as Prisma.InputJsonValue) ?? {},
            status: 'PROCESSING',
            attempts: 1,
            heartbeatAt: now,
          },
        });

    // 3. Execute business handler
    try {
      const result = await handler();

      // 4. Mark status = PROCESSED atomically
      await prisma.platformInboxEvent.update({
        where: { id: inboxRecord.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        },
      });

      return { status: 'PROCESSED', result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const attempts = inboxRecord.attempts;
      const isDeadLetter = attempts >= 5;
      const nextStatus = isDeadLetter ? 'DEAD_LETTER' : 'FAILED';
      const backoffSeconds = Math.min(300, 2 ** attempts);
      const availableAt = new Date(Date.now() + backoffSeconds * 1_000);

      await prisma.platformInboxEvent.update({
        where: { id: inboxRecord.id },
        data: {
          status: nextStatus,
          availableAt,
          deadLetteredAt: isDeadLetter ? new Date() : null,
          lastError: errorMessage,
          updatedAt: new Date(),
        },
      });

      if (isDeadLetter) {
        this.logger.error(
          `Message ${messageId} moved to DEAD_LETTER after ${attempts} attempts for group ${consumerGroup}: ${errorMessage}`,
        );
        return { status: 'DEAD_LETTER', error: errorMessage };
      }

      this.logger.warn(
        `Message ${messageId} failed processing (attempt ${attempts}): ${errorMessage}. Next retry in ${backoffSeconds}s.`,
      );
      return { status: 'FAILED', error: errorMessage };
    }
  }

  /**
   * Compare-and-Swap (CAS) reclamation of crashed consumer leases.
   */
  async reclaimStaleLeases(consumerGroup: string, staleTimeoutSeconds = 300): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleTimeoutSeconds * 1_000);

    const staleRecords = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "platform_inbox_events"
      SET
        "status" = 'FAILED',
        "lastError" = 'LEASE_TIMEOUT_RECLAIMED',
        "availableAt" = NOW(),
        "updatedAt" = NOW()
      WHERE
        "consumerGroup" = ${consumerGroup}
        AND "status" = 'PROCESSING'
        AND COALESCE("heartbeatAt", "createdAt") < ${staleThreshold}
      RETURNING "id"
    `);

    return staleRecords.length;
  }
}
