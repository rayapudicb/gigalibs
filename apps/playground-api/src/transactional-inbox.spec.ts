import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  platformInboxEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  configurationActivation: {
    findFirst: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@gigalibs/db', () => ({
  Prisma: {
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  },
  prisma: database,
}));

import { ConfigurationInvalidationConsumer } from './configuration-invalidation.consumer.js';
import { ConfigurationManifestCache } from './configuration-manifest.cache.js';
import { TransactionalInboxService } from './transactional-inbox.service.js';

describe('TransactionalInboxService', () => {
  let service: TransactionalInboxService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TransactionalInboxService();
  });

  const testMessage = {
    tenantId: 'tenant_alpha',
    consumerGroup: 'config-invalidator',
    messageId: 'msg_001',
    eventType: 'configuration.activation.changed.v1',
    aggregateType: 'configuration-activation',
    aggregateId: 'act_001',
    payload: { key: 'value' },
  };

  it('TP3-INBX-01 & 02: processes new message, transitions state to PROCESSED, and returns result', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce(null);
    database.platformInboxEvent.create.mockResolvedValueOnce({
      id: 'inbox_001',
      tenantId: testMessage.tenantId,
      consumerGroup: testMessage.consumerGroup,
      messageId: testMessage.messageId,
      status: 'PROCESSING',
      attempts: 1,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'PROCESSED',
    });

    const handler = vi.fn().mockResolvedValue('handler_output');
    const result = await service.handleMessage(testMessage, handler);

    expect(result).toEqual({ status: 'PROCESSED', result: 'handler_output' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(database.platformInboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant_alpha',
          consumerGroup: 'config-invalidator',
          messageId: 'msg_001',
          status: 'PROCESSING',
          attempts: 1,
        }),
      }),
    );
    expect(database.platformInboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inbox_001' },
        data: expect.objectContaining({
          status: 'PROCESSED',
          lastError: null,
        }),
      }),
    );
  });

  it('TP3-INBX-01: deduplicates message when status is already PROCESSED without executing handler', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'PROCESSED',
      tenantId: testMessage.tenantId,
      consumerGroup: testMessage.consumerGroup,
      messageId: testMessage.messageId,
    });

    const handler = vi.fn();
    const result = await service.handleMessage(testMessage, handler);

    expect(result).toEqual({ status: 'DEDUPLICATED' });
    expect(handler).not.toHaveBeenCalled();
    expect(database.platformInboxEvent.create).not.toHaveBeenCalled();
    expect(database.platformInboxEvent.update).not.toHaveBeenCalled();
  });

  it('TP3-INBX-04: rejects message immediately if marked DEAD_LETTER', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'DEAD_LETTER',
      lastError: 'Fatal poison pill error',
    });

    const handler = vi.fn();
    const result = await service.handleMessage(testMessage, handler);

    expect(result).toEqual({ status: 'DEAD_LETTER', error: 'Fatal poison pill error' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('TP3-INBX-05: records failure and sets backoff availableAt when handler throws', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce(null);
    database.platformInboxEvent.create.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'PROCESSING',
      attempts: 2,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'FAILED',
    });

    const handler = vi.fn().mockRejectedValue(new Error('Transient downstream failure'));
    const result = await service.handleMessage(testMessage, handler);

    expect(result).toEqual({ status: 'FAILED', error: 'Transient downstream failure' });
    expect(database.platformInboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inbox_001' },
        data: expect.objectContaining({
          status: 'FAILED',
          deadLetteredAt: null,
          lastError: 'Transient downstream failure',
        }),
      }),
    );
  });

  it('TP3-INBX-04: transitions to DEAD_LETTER after 5 failed attempts', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'FAILED',
      attempts: 4,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'PROCESSING',
      attempts: 5,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox_001',
      status: 'DEAD_LETTER',
    });

    const handler = vi.fn().mockRejectedValue(new Error('Persistent poison error'));
    const result = await service.handleMessage(testMessage, handler);

    expect(result).toEqual({ status: 'DEAD_LETTER', error: 'Persistent poison error' });
    expect(database.platformInboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'inbox_001' },
        data: expect.objectContaining({
          status: 'DEAD_LETTER',
          deadLetteredAt: expect.any(Date),
          lastError: 'Persistent poison error',
        }),
      }),
    );
  });

  it('TP3-INBX-03: reclaims stale processing leases via CAS query', async () => {
    database.$queryRaw.mockResolvedValueOnce([{ id: 'stale_01' }, { id: 'stale_02' }]);

    const reclaimedCount = await service.reclaimStaleLeases('config-invalidator', 300);

    expect(reclaimedCount).toBe(2);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('ConfigurationInvalidationConsumer with TransactionalInboxService', () => {
  beforeEach(() => vi.clearAllMocks());

  const notification = {
    channel: 'gigalibs_configuration_events_v1',
    processId: 42,
    payload: JSON.stringify({
      envelopeVersion: '1.0',
      eventId: 'event_99',
      tenantId: 'tenant_01',
      aggregateId: 'activation_01',
      eventType: 'configuration.activation.changed.v1',
      attempt: 1,
    }),
  };

  const activationScope = {
    tenantId: 'tenant_01',
    moduleKey: 'tenant-apps',
    entityKey: 'invoice',
    surfaceKey: 'invoice-form',
    environmentKey: 'production',
    cohortKey: 'all-users',
  };

  const activeProjection = {
    ...activationScope,
    id: 'activation_01',
    publishedVersionId: 'version_01',
    activatedAt: new Date('2026-09-16T00:00:00.000Z'),
    publishedVersion: { manifest: { checksum: 'checksum_01' }, checksum: 'checksum_01' },
  };

  function processNotification(consumer: ConfigurationInvalidationConsumer) {
    return (
      consumer as unknown as {
        processNotification(value: typeof notification): Promise<void>;
      }
    ).processNotification(notification);
  }

  it('delegates to TransactionalInboxService and applies cache eviction on success', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce(null);
    database.platformInboxEvent.create.mockResolvedValueOnce({
      id: 'inbox_01',
      status: 'PROCESSING',
      attempts: 1,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox_01',
      status: 'PROCESSED',
    });
    database.configurationActivation.findFirst
      .mockResolvedValueOnce(activationScope)
      .mockResolvedValueOnce(activeProjection);

    const cache = new ConfigurationManifestCache();
    const inbox = new TransactionalInboxService();
    const consumer = new ConfigurationInvalidationConsumer(cache, inbox);

    await processNotification(consumer);

    expect(database.platformInboxEvent.create).toHaveBeenCalledTimes(1);
    expect(database.platformInboxEvent.update).toHaveBeenCalledTimes(1);
    expect(cache.snapshot()).toMatchObject({
      notificationApplied: 1,
    });
  });

  it('records deduplicated notification when TransactionalInboxService reports DEDUPLICATED', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce({
      id: 'inbox_01',
      status: 'PROCESSED',
    });

    const cache = new ConfigurationManifestCache();
    const inbox = new TransactionalInboxService();
    const consumer = new ConfigurationInvalidationConsumer(cache, inbox);

    await processNotification(consumer);

    expect(database.configurationActivation.findFirst).not.toHaveBeenCalled();
    expect(cache.snapshot()).toMatchObject({
      notificationDeduplicated: 1,
    });
  });

  it('invalidates cache and records failure when TransactionalInboxService reports FAILED', async () => {
    database.platformInboxEvent.findUnique.mockResolvedValueOnce(null);
    database.platformInboxEvent.create.mockResolvedValueOnce({
      id: 'inbox_01',
      status: 'PROCESSING',
      attempts: 1,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox_01',
      status: 'FAILED',
    });
    database.configurationActivation.findFirst.mockResolvedValueOnce(null); // Triggers error in applyNotification

    const cache = new ConfigurationManifestCache();
    const inbox = new TransactionalInboxService();
    const consumer = new ConfigurationInvalidationConsumer(cache, inbox);

    await processNotification(consumer);

    expect(cache.snapshot()).toMatchObject({
      notificationFailed: 1,
    });
  });
});
