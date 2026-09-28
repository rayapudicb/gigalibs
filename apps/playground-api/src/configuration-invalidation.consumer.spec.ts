import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  configurationActivation: { findFirst: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: database }));

import { ConfigurationInvalidationConsumer } from './configuration-invalidation.consumer.js';
import { ConfigurationManifestCache } from './configuration-manifest.cache.js';

const notification = {
  channel: 'gigalibs_configuration_events_v1',
  processId: 42,
  payload: JSON.stringify({
    envelopeVersion: '1.0',
    eventId: 'event_01',
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

describe('ConfigurationInvalidationConsumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reconciles activation notifications and deduplicates only after success', async () => {
    database.configurationActivation.findFirst
      .mockResolvedValueOnce(activationScope)
      .mockResolvedValueOnce(activeProjection);
    const cache = new ConfigurationManifestCache();
    const consumer = new ConfigurationInvalidationConsumer(cache);

    await processNotification(consumer);
    await processNotification(consumer);

    expect(database.configurationActivation.findFirst).toHaveBeenCalledTimes(2);
    expect(cache.snapshot()).toMatchObject({
      entries: 1,
      notificationApplied: 1,
      notificationDeduplicated: 1,
      resynchronizationSucceeded: 1,
    });
  });

  it('does not deduplicate a failed reconciliation and accepts its replay', async () => {
    database.configurationActivation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activationScope)
      .mockResolvedValueOnce(activeProjection);
    const cache = new ConfigurationManifestCache();
    const consumer = new ConfigurationInvalidationConsumer(cache);

    await processNotification(consumer);
    await processNotification(consumer);

    expect(cache.snapshot()).toMatchObject({
      notificationFailed: 1,
      notificationApplied: 1,
      notificationDeduplicated: 0,
    });
  });
});
