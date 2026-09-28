import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => {
  const transaction = {
    controlOutboxEvent: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    transaction,
  };
});

vi.mock('@gigalibs/db', () => ({
  Prisma: {
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  },
  prisma: database,
}));

vi.mock('./config/runtime-config.js', () => ({
  runtimeConfig: {
    controlOutboxPollIntervalSeconds: 60,
    controlOutboxBatchSize: 25,
    controlOutboxClaimTimeoutSeconds: 30,
    controlOutboxMaxAttempts: 3,
    controlOutboxRetryBaseSeconds: 2,
    controlOutboxRetryMaxSeconds: 30,
  },
}));

import { ControlOutboxWorker } from './control-outbox.worker.js';

const event = {
  id: 'outbox_01',
  eventId: 'event_01',
  tenantId: 'tenant_01',
  aggregateId: 'configuration_01',
  eventType: 'configuration.activation.changed.v1',
  attempts: 1,
};

function createWorker(publish = vi.fn().mockResolvedValue(undefined)) {
  return {
    publish,
    worker: new ControlOutboxWorker(
      { processSourceEvent: vi.fn() } as never,
      {} as never,
      { publish } as never,
    ),
  };
}

describe('ControlOutboxWorker Configuration delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    database.$queryRaw.mockResolvedValue([{ ...event }]);
    database.transaction.controlOutboxEvent.updateMany.mockResolvedValue({ count: 1 });
    database.transaction.auditLog.create.mockResolvedValue({});
  });

  it('publishes and marks the exact claimed attempt in one transaction', async () => {
    const { publish, worker } = createWorker();

    await worker.tick();

    expect(publish).toHaveBeenCalledWith(database.transaction, event);
    expect(database.transaction.controlOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: event.id, status: 'PROCESSING', attempts: 1 },
      data: {
        status: 'PUBLISHED',
        publishedAt: expect.any(Date),
        claimedAt: null,
        lastErrorCode: null,
      },
    });
    expect(database.transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns a transient publish failure to PENDING with bounded backoff', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T04:00:00.000Z'));
    const { worker } = createWorker(vi.fn().mockRejectedValue(new Error('connection reset')));

    await worker.tick();

    expect(database.transaction.controlOutboxEvent.updateMany).toHaveBeenLastCalledWith({
      where: { id: event.id, status: 'PROCESSING', attempts: 1 },
      data: {
        status: 'PENDING',
        availableAt: new Date('2026-09-16T04:00:02.000Z'),
        claimedAt: null,
        publishedAt: null,
        lastErrorCode: 'CANONICAL_PROCESSING_ERROR',
      },
    });
    expect(database.transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails an invalid Configuration envelope immediately and writes a redacted audit record', async () => {
    const { worker } = createWorker(
      vi.fn().mockRejectedValue(new Error('CONFIGURATION_EVENT_TYPE_INVALID')),
    );

    await worker.tick();

    expect(database.transaction.controlOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: event.id, status: 'PROCESSING', attempts: 1 },
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'CONFIGURATION_EVENT_TYPE_INVALID',
        }),
      }),
    );
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: event.tenantId,
        action: 'STATUS_CHANGE',
        resource: 'control-outbox-event',
        resourceId: event.id,
        after: {
          status: 'FAILED',
          eventId: event.eventId,
          eventType: event.eventType,
          errorCode: 'CONFIGURATION_EVENT_TYPE_INVALID',
          attempts: 1,
        },
      },
    });
  });

  it('fails a transient error at the configured attempt ceiling', async () => {
    database.$queryRaw.mockResolvedValue([{ ...event, attempts: 3 }]);
    const { worker } = createWorker(vi.fn().mockRejectedValue(new Error('connection reset')));

    await worker.tick();

    expect(database.transaction.controlOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: event.id, status: 'PROCESSING', attempts: 3 },
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'CANONICAL_PROCESSING_ERROR',
        }),
      }),
    );
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceId: event.id,
          after: expect.objectContaining({ status: 'FAILED', attempts: 3 }),
        }),
      }),
    );
  });

  it('does not create a terminal audit record after losing the claimed attempt', async () => {
    database.transaction.controlOutboxEvent.updateMany.mockResolvedValue({ count: 0 });
    const { worker } = createWorker(
      vi.fn().mockRejectedValue(new Error('CONFIGURATION_EVENT_TYPE_INVALID')),
    );

    await worker.tick();

    expect(database.transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
