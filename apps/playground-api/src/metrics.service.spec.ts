import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  sourceEvent: { groupBy: vi.fn() },
  controlOutboxEvent: { groupBy: vi.fn(), aggregate: vi.fn() },
  connectorAttempt: { groupBy: vi.fn() },
  operationalException: { groupBy: vi.fn() },
  businessAction: { groupBy: vi.fn() },
  dataRetentionExecution: { groupBy: vi.fn() },
  configurationChangeSet: { groupBy: vi.fn(), count: vi.fn() },
  configurationActivation: { groupBy: vi.fn() },
  configurationPublishedVersion: { count: vi.fn() },
  configurationRecord: { count: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: database }));

import { ConfigurationManifestCache } from './configuration-manifest.cache.js';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const repository of Object.values(database)) {
      if ('groupBy' in repository) repository.groupBy.mockResolvedValue([]);
      if ('count' in repository) repository.count.mockResolvedValue(0);
      if ('aggregate' in repository)
        repository.aggregate.mockResolvedValue({ _min: { createdAt: null } });
    }
  });

  it('uses bounded route templates and collapses framework catch-all paths', async () => {
    const metrics = new MetricsService();
    metrics.recordHttpRequest({
      method: 'get',
      route: '/api/v1/tenants/:tenantId',
      statusCode: 200,
      durationSeconds: 0.01,
    });
    metrics.recordHttpRequest({
      method: 'get',
      route: '/api/v1/{*path}',
      statusCode: 404,
      durationSeconds: 0.01,
    });

    const output = await metrics.renderPrometheus();

    expect(output).toContain('route="/api/v1/tenants/:tenantId",status="200"');
    expect(output).toContain('route="unmatched",status="404"');
    expect(output).not.toContain('{*path}');
  });

  it('emits cumulative histogram buckets from measured requests', async () => {
    const metrics = new MetricsService();
    metrics.recordHttpRequest({
      method: 'POST',
      route: '/api/v1/actions',
      statusCode: 202,
      durationSeconds: 0.02,
    });

    const output = await metrics.renderPrometheus();

    expect(output).toContain(
      'gigalibs_http_request_duration_seconds_bucket{method="POST",route="/api/v1/actions",status="202",le="0.01"} 0',
    );
    expect(output).toContain(
      'gigalibs_http_request_duration_seconds_bucket{method="POST",route="/api/v1/actions",status="202",le="0.025"} 1',
    );
    expect(output).toContain(
      'gigalibs_http_request_duration_seconds_count{method="POST",route="/api/v1/actions",status="202"} 1',
    );
  });

  it('reports a failed database collection without reusing prior gauge values', async () => {
    const metrics = new MetricsService();
    database.sourceEvent.groupBy.mockResolvedValueOnce([
      { status: 'PROCESSED', _count: { _all: 7 } },
    ]);
    const successful = await metrics.renderPrometheus();
    expect(successful).toContain('gigalibs_source_events{status="PROCESSED"} 7');

    database.sourceEvent.groupBy.mockRejectedValueOnce(new Error('database unavailable'));
    const failed = await metrics.renderPrometheus();

    expect(failed).toContain('gigalibs_metrics_collection_success{collector="database"} 0');
    expect(failed).toContain('gigalibs_metrics_collection_failures_total{collector="database"} 1');
    expect(failed).not.toContain('gigalibs_source_events{status="PROCESSED"} 7');
  });

  it('emits bounded Configuration Studio lifecycle gauges', async () => {
    database.configurationChangeSet.groupBy.mockResolvedValueOnce([
      { status: 'SUBMITTED', _count: { _all: 2 } },
    ]);
    database.configurationActivation.groupBy.mockResolvedValueOnce([
      { status: 'ACTIVE', _count: { _all: 1 } },
    ]);
    database.configurationPublishedVersion.count.mockResolvedValueOnce(3);
    database.configurationRecord.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    database.controlOutboxEvent.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'PENDING', _count: { _all: 5 } }]);
    database.controlOutboxEvent.aggregate.mockResolvedValueOnce({
      _min: { createdAt: new Date(Date.now() - 60_000) },
    });
    database.configurationChangeSet.count.mockResolvedValueOnce(2);

    const output = await new MetricsService().renderPrometheus();

    expect(output).toContain('gigalibs_configuration_change_sets{status="SUBMITTED"} 2');
    expect(output).toContain('gigalibs_configuration_activations{status="ACTIVE"} 1');
    expect(output).toContain('gigalibs_configuration_published_versions 3');
    expect(output).toContain('gigalibs_configuration_records{status="ACTIVE"} 4');
    expect(output).toContain('gigalibs_configuration_records{status="DELETED"} 1');
    expect(output).toContain('gigalibs_configuration_outbox_events{status="PENDING"} 5');
    expect(output).toMatch(
      /gigalibs_configuration_outbox_oldest_pending_age_seconds 6\d(?:\.\d+)?/,
    );
    expect(output).toContain('gigalibs_configuration_submitted_change_sets_older_than_24h 2');
  });

  it('emits bounded manifest cache and invalidation-consumer telemetry', async () => {
    const cache = new ConfigurationManifestCache();
    cache.markListenerConnected();
    await cache.read(
      {
        tenantId: 'tenant_01',
        moduleKey: 'tenant-apps',
        entityKey: 'invoice',
        surfaceKey: 'invoice-form',
        environmentKey: 'production',
        cohortKey: 'all-users',
      },
      async () => ({
        activationId: 'activation_01',
        publishedVersionId: 'version_01',
        activatedAt: new Date('2026-09-16T00:00:00.000Z'),
        manifest: { checksum: 'checksum_01' } as never,
        checksum: 'checksum_01',
      }),
    );
    cache.recordNotification('applied');
    cache.recordNotification('deduplicated');
    cache.recordReconnect();

    const output = await new MetricsService(cache).renderPrometheus();

    expect(output).toContain('gigalibs_configuration_manifest_listener_connected 1');
    expect(output).toContain('gigalibs_configuration_manifest_cache_entries 1');
    expect(output).toContain(
      'gigalibs_configuration_manifest_cache_requests_total{result="miss"} 1',
    );
    expect(output).toContain(
      'gigalibs_configuration_manifest_consumer_notifications_total{result="applied"} 1',
    );
    expect(output).toContain(
      'gigalibs_configuration_manifest_consumer_notifications_total{result="deduplicated"} 1',
    );
    expect(output).toContain('gigalibs_configuration_manifest_reconnects_total 1');
  });
});
