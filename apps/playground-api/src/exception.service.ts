import { createHash, randomUUID } from 'node:crypto';
import type {
  AssignOperationalExceptionDto,
  EditAndReplayExceptionDto,
  ExceptionRecoveryCommandDto,
  IngestOperationalEventDto,
  ListOperationalExceptionsDto,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { OperationalIntelligenceService } from './operational-intelligence.service.js';
import { canonicalJson } from './operational-json.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { PayloadCryptoService, sourceEventAuthenticatedContext } from './payload-crypto.service.js';
import { resolveTenantId } from './tenant-resolver.js';

const exceptionDetailInclude = {
  environment: { select: { id: true, slug: true, displayName: true, kind: true } },
  sourceEvent: {
    select: {
      id: true,
      eventId: true,
      eventType: true,
      eventVersion: true,
      classification: true,
      correlationId: true,
      status: true,
      rejectionCode: true,
      rejectionDetail: true,
      receivedAt: true,
      processedAt: true,
    },
  },
  supplierInvoice: {
    select: {
      id: true,
      externalId: true,
      invoiceNumber: true,
      totalMinor: true,
      currency: true,
      status: true,
    },
  },
  matchEvaluation: {
    include: {
      findings: true,
      evidenceBundle: { include: { items: true } },
    },
  },
  businessAction: {
    select: { id: true, actionType: true, status: true, risk: true, preview: true },
  },
  recoveries: {
    include: {
      replaySourceEvent: {
        select: { id: true, eventId: true, status: true, rejectionCode: true, processedAt: true },
      },
    },
    orderBy: { requestedAt: 'desc' as const },
  },
} satisfies Prisma.OperationalExceptionInclude;

type RecoveryOperation = 'ASSIGN' | 'RETRY' | 'REPLAY' | 'EDIT_AND_REPLAY' | 'RESOLVE';

@Injectable()
export class ExceptionService {
  constructor(
    private readonly operationalIntelligence: OperationalIntelligenceService,
    private readonly payloadCrypto: PayloadCryptoService,
  ) {}

  async list(tenantId: string, query: ListOperationalExceptionsDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const records = await prisma.operationalException.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      },
      include: {
        environment: { select: { slug: true, displayName: true } },
        sourceEvent: {
          select: {
            eventId: true,
            eventType: true,
            eventVersion: true,
            classification: true,
            status: true,
            rejectionCode: true,
          },
        },
        supplierInvoice: {
          select: { invoiceNumber: true, totalMinor: true, currency: true, status: true },
        },
        businessAction: { select: { actionType: true, status: true } },
        _count: { select: { recoveries: true } },
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    const hasNextPage = records.length > query.limit;
    const items = hasNextPage ? records.slice(0, query.limit) : records;
    return this.jsonSafe({
      items,
      nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
    });
  }

  async get(tenantId: string, exceptionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const exception = await prisma.operationalException.findFirst({
      where: { id: exceptionId, tenantId: resolvedTenantId },
      include: exceptionDetailInclude,
    });
    if (!exception) throw new NotFoundException(`Exception '${exceptionId}' was not found.`);
    return this.jsonSafe(exception);
  }

  async assign(
    tenantId: string,
    userId: string,
    exceptionId: string,
    dto: AssignOperationalExceptionDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const exception = await this.requireException(resolvedTenantId, exceptionId);
    if (exception.status === 'RESOLVED') {
      throw new ConflictException('A resolved exception cannot be assigned.');
    }
    const assignee = await prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId: dto.assignedToId, tenantId: resolvedTenantId } },
    });
    if (!assignee || assignee.status !== 'ACTIVE') {
      throw new ForbiddenException('The assignee must be an active member of this tenant.');
    }
    const input = { assignedToId: dto.assignedToId, reason: dto.reason };
    const recovery = await this.findOrCreateRecovery(
      exception,
      userId,
      'ASSIGN',
      dto.idempotencyKey,
      input,
      'SUCCEEDED',
    );
    if (recovery.status === 'SUCCEEDED') {
      await prisma.$transaction(async (transaction) => {
        await transaction.operationalException.updateMany({
          where: { id: exception.id, tenantId: resolvedTenantId, status: { not: 'RESOLVED' } },
          data: { status: 'ASSIGNED', assignedToId: dto.assignedToId },
        });
        await this.auditRecovery(transaction, exception, userId, recovery.id, input);
      });
    }
    return this.get(resolvedTenantId, exception.id);
  }

  async resolve(
    tenantId: string,
    userId: string,
    exceptionId: string,
    dto: ExceptionRecoveryCommandDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const exception = await this.requireException(resolvedTenantId, exceptionId);
    const input = { reason: dto.reason };
    const recovery = await this.findOrCreateRecovery(
      exception,
      userId,
      'RESOLVE',
      dto.idempotencyKey,
      input,
      'SUCCEEDED',
    );
    if (exception.status !== 'RESOLVED') {
      await prisma.$transaction(async (transaction) => {
        await transaction.operationalException.update({
          where: { id: exception.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        await this.auditRecovery(transaction, exception, userId, recovery.id, input);
      });
    }
    return this.get(resolvedTenantId, exception.id);
  }

  async retry(
    tenantId: string,
    userId: string,
    exceptionId: string,
    dto: ExceptionRecoveryCommandDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const exception = await this.requireException(resolvedTenantId, exceptionId);
    if (
      exception.kind !== 'PROCESSING_FAILURE' ||
      !exception.retryable ||
      !exception.sourceEventId
    ) {
      throw new ConflictException('This exception is not eligible for an infrastructure retry.');
    }
    if (exception.status === 'RESOLVED') {
      throw new ConflictException('A resolved exception cannot be retried.');
    }
    const input = { sourceEventId: exception.sourceEventId, reason: dto.reason };
    const recovery = await this.findOrCreateRecovery(
      exception,
      userId,
      'RETRY',
      dto.idempotencyKey,
      input,
      'REQUESTED',
    );
    if (exception.status === 'RETRY_SCHEDULED') {
      return this.get(resolvedTenantId, exception.id);
    }
    if (recovery.status === 'REQUESTED') {
      const reset = await prisma.$transaction(async (transaction) => {
        const outbox = await transaction.controlOutboxEvent.updateMany({
          where: {
            tenantId: resolvedTenantId,
            aggregateId: exception.sourceEventId as string,
            status: 'FAILED',
          },
          data: {
            status: 'PENDING',
            attempts: 0,
            availableAt: new Date(),
            claimedAt: null,
            publishedAt: null,
            lastErrorCode: null,
          },
        });
        if (outbox.count === 0) return false;
        await transaction.sourceEvent.update({
          where: { id: exception.sourceEventId as string },
          data: {
            status: 'VALIDATED',
            rejectionCode: null,
            rejectionDetail: Prisma.DbNull,
            processedAt: null,
          },
        });
        await transaction.operationalException.update({
          where: { id: exception.id },
          data: { status: 'RETRY_SCHEDULED', resolvedAt: null },
        });
        await this.auditRecovery(transaction, exception, userId, recovery.id, input);
        return true;
      });
      if (!reset) {
        await prisma.exceptionRecovery.update({
          where: { id: recovery.id },
          data: {
            status: 'FAILED',
            errorCode: 'OUTBOX_EVENT_NOT_RETRYABLE',
            result: { accepted: false },
            completedAt: new Date(),
          },
        });
        throw new ConflictException('The source event does not have a failed outbox delivery.');
      }
    }
    return this.get(resolvedTenantId, exception.id);
  }

  replay(tenantId: string, userId: string, exceptionId: string, dto: ExceptionRecoveryCommandDto) {
    return this.replayInternal(tenantId, userId, exceptionId, dto, undefined, 'REPLAY');
  }

  editAndReplay(
    tenantId: string,
    userId: string,
    exceptionId: string,
    dto: EditAndReplayExceptionDto,
  ) {
    return this.replayInternal(
      tenantId,
      userId,
      exceptionId,
      dto,
      dto.replacementPayload,
      'EDIT_AND_REPLAY',
    );
  }

  async recordProcessingFailure(
    transaction: Prisma.TransactionClient,
    event: {
      id: string;
      tenantId: string;
      environmentId: string;
      eventId: string;
      eventType: string;
      classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    },
    errorCode: string,
    attempts: number,
  ) {
    const existing = await transaction.operationalException.findFirst({
      where: {
        tenantId: event.tenantId,
        kind: 'PROCESSING_FAILURE',
        sourceEventId: event.id,
      },
      select: { id: true },
    });
    if (existing) {
      await transaction.operationalException.update({
        where: { id: existing.id },
        data: { status: 'OPEN', resolvedAt: null },
      });
      return;
    }
    await transaction.operationalException.create({
      data: {
        tenantId: event.tenantId,
        environmentId: event.environmentId,
        sourceEventId: event.id,
        kind: 'PROCESSING_FAILURE',
        status: 'OPEN',
        severity: 'BLOCKING',
        title: 'Canonical event processing failed',
        summary: `Event ${event.eventId} could not be processed after ${attempts} attempts.`,
        businessImpact: {
          affectedEventCount: 1,
          downstreamOutcomeBlocked: true,
          eventType: event.eventType,
        },
        rootCauseCode: errorCode,
        retryable: true,
        classification: event.classification,
      },
    });
  }

  async recordProcessingSuccess(
    transaction: Prisma.TransactionClient,
    event: { id: string; tenantId: string; eventId: string },
  ) {
    const completedAt = new Date();
    const recoveries = await transaction.exceptionRecovery.findMany({
      where: {
        tenantId: event.tenantId,
        status: 'REQUESTED',
        OR: [
          { replaySourceEventId: event.id },
          { exception: { sourceEventId: event.id, kind: 'PROCESSING_FAILURE' } },
        ],
      },
      select: { id: true, exceptionId: true, operation: true },
    });
    for (const recovery of recoveries) {
      await transaction.exceptionRecovery.update({
        where: { id: recovery.id },
        data: {
          status: 'SUCCEEDED',
          result: { processedSourceEventId: event.id, eventId: event.eventId },
          completedAt,
        },
      });
      await transaction.operationalException.updateMany({
        where: { id: recovery.exceptionId, status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', resolvedAt: completedAt },
      });
    }
  }

  async recordRecoveryFailure(
    transaction: Prisma.TransactionClient,
    event: { id: string; tenantId: string },
    errorCode: string,
  ) {
    const recoveries = await transaction.exceptionRecovery.findMany({
      where: {
        tenantId: event.tenantId,
        status: 'REQUESTED',
        OR: [
          { replaySourceEventId: event.id },
          { exception: { sourceEventId: event.id, kind: 'PROCESSING_FAILURE' } },
        ],
      },
      select: { id: true, exceptionId: true },
    });
    for (const recovery of recoveries) {
      await transaction.exceptionRecovery.update({
        where: { id: recovery.id },
        data: {
          status: 'FAILED',
          errorCode,
          result: { processed: false, sourceEventId: event.id },
          completedAt: new Date(),
        },
      });
      await transaction.operationalException.updateMany({
        where: { id: recovery.exceptionId, status: { not: 'RESOLVED' } },
        data: { status: 'OPEN', resolvedAt: null },
      });
    }
  }

  private async replayInternal(
    tenantId: string,
    userId: string,
    exceptionId: string,
    dto: ExceptionRecoveryCommandDto,
    replacementPayload: IngestOperationalEventDto['payload'] | undefined,
    operation: 'REPLAY' | 'EDIT_AND_REPLAY',
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const exception = await this.requireException(resolvedTenantId, exceptionId);
    if (exception.kind !== 'PROCESSING_FAILURE' || !exception.retryable) {
      throw new ConflictException(
        'Replay is limited to retryable processing failures; business exceptions require new source evidence.',
      );
    }
    if (!exception.sourceEventId || !exception.sourceEvent) {
      throw new ConflictException('This exception has no source event to replay.');
    }
    if (exception.status === 'RESOLVED') {
      throw new ConflictException('A resolved exception cannot be replayed.');
    }
    const source = await prisma.sourceEvent.findFirst({
      where: { id: exception.sourceEventId, tenantId: resolvedTenantId },
    });
    if (!source) throw new NotFoundException('The exception source event was not found.');
    if (source.payloadPurgedAt && !replacementPayload) {
      throw new ConflictException(
        'The source payload was removed by retention policy; edit-and-replay requires a replacement payload.',
      );
    }
    const payload = (replacementPayload ??
      this.payloadCrypto.decrypt(
        {
          ciphertext: source.payloadCiphertext,
          iv: source.payloadIv,
          authTag: source.payloadAuthTag,
          keyVersion: source.payloadKeyVersion,
        },
        sourceEventAuthenticatedContext(
          source.tenantId,
          source.eventId,
          source.eventType,
          source.eventVersion,
        ),
      )) as IngestOperationalEventDto['payload'];
    const input = {
      sourceEventId: source.id,
      payloadHash: createHash('sha256').update(canonicalJson(payload)).digest('hex'),
      reason: dto.reason,
    };
    const recovery = await this.findOrCreateRecovery(
      exception,
      userId,
      operation,
      dto.idempotencyKey,
      input,
      'REQUESTED',
    );
    if (recovery.status !== 'REQUESTED') return this.get(resolvedTenantId, exception.id);

    const replayEventId = `replay-${recovery.id}`;
    try {
      const result = await this.operationalIntelligence.ingestEvent(resolvedTenantId, userId, {
        eventId: replayEventId,
        tenantId: resolvedTenantId,
        environmentId: source.environmentId,
        sourceId: source.sourceConnectionId,
        eventType: source.eventType,
        eventVersion: source.eventVersion,
        occurredAt: source.occurredAt.toISOString(),
        correlationId: source.correlationId,
        idempotencyKey: `exception-replay:${recovery.id}`,
        actor: { type: 'exception-recovery', id: userId },
        entityRefs: {
          ...(source.entityRefs as Record<string, string | string[]>),
          replayOfEventId: source.eventId,
          exceptionId: exception.id,
        },
        classification: source.classification,
        payload,
      });
      await prisma.$transaction(async (transaction) => {
        await transaction.exceptionRecovery.update({
          where: { id: recovery.id },
          data: {
            replaySourceEventId: result.id,
            result: { accepted: true, duplicate: result.duplicate, eventId: result.eventId },
          },
        });
        await transaction.operationalException.update({
          where: { id: exception.id },
          data: { status: 'RETRY_SCHEDULED', resolvedAt: null },
        });
        await this.auditRecovery(transaction, exception, userId, recovery.id, input);
      });
    } catch (error) {
      const errorCode = this.errorCode(error);
      await prisma.exceptionRecovery.update({
        where: { id: recovery.id },
        data: {
          status: 'FAILED',
          errorCode,
          result: { accepted: false },
          completedAt: new Date(),
        },
      });
      throw error;
    }
    return this.get(resolvedTenantId, exception.id);
  }

  private async findOrCreateRecovery(
    exception: Awaited<ReturnType<ExceptionService['requireException']>>,
    userId: string,
    operation: RecoveryOperation,
    idempotencyKey: string,
    input: Record<string, unknown>,
    status: 'REQUESTED' | 'SUCCEEDED',
  ) {
    const inputHash = createHash('sha256')
      .update(canonicalJson({ operation, ...input }))
      .digest('hex');
    const existing = await prisma.exceptionRecovery.findUnique({
      where: { exceptionId_idempotencyKey: { exceptionId: exception.id, idempotencyKey } },
    });
    if (existing) {
      if (existing.inputHash !== inputHash || existing.operation !== operation) {
        throw new ConflictException('The idempotency key was used with different recovery input.');
      }
      return existing;
    }
    try {
      return await prisma.exceptionRecovery.create({
        data: {
          id: randomUUID(),
          tenantId: exception.tenantId,
          exceptionId: exception.id,
          operation,
          status,
          requestedById: userId,
          reason: String(input.reason),
          idempotencyKey,
          inputHash,
          result: status === 'SUCCEEDED' ? { completed: true } : { accepted: true },
          ...(status === 'SUCCEEDED' ? { completedAt: new Date() } : {}),
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      const raced = await prisma.exceptionRecovery.findUnique({
        where: { exceptionId_idempotencyKey: { exceptionId: exception.id, idempotencyKey } },
      });
      if (!raced || raced.inputHash !== inputHash || raced.operation !== operation) {
        throw new ConflictException('The idempotency key was used with different recovery input.');
      }
      return raced;
    }
  }

  private async requireException(tenantId: string, exceptionId: string) {
    const exception = await prisma.operationalException.findFirst({
      where: { id: exceptionId, tenantId },
      include: { sourceEvent: { select: { id: true } } },
    });
    if (!exception) throw new NotFoundException(`Exception '${exceptionId}' was not found.`);
    return exception;
  }

  private auditRecovery(
    transaction: Prisma.TransactionClient,
    exception: { id: string; tenantId: string; kind: string },
    userId: string,
    recoveryId: string,
    input: Record<string, unknown>,
  ) {
    return transaction.auditLog.create({
      data: {
        tenantId: exception.tenantId,
        userId,
        action: 'STATUS_CHANGE',
        resource: 'operational-exception-recovery',
        resourceId: exception.id,
        after: { recoveryId, kind: exception.kind, ...input },
      },
    });
  }

  private errorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code);
      if (/^[A-Z0-9_]{2,100}$/.test(code)) return code;
    }
    return 'REPLAY_REQUEST_FAILED';
  }

  private isUniqueConstraint(error: unknown) {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
  }

  private jsonSafe<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, child) =>
        typeof child === 'bigint' ? child.toString() : child,
      ),
    ) as T;
  }
}
