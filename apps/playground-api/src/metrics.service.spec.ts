import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  sourceEvent: { groupBy: vi.fn() },
  controlOutboxEvent: { groupBy: vi.fn() },
  connectorAttempt: { groupBy: vi.fn() },
  operationalException: { groupBy: vi.fn() },
  businessAction: { groupBy: vi.fn() },
  dataRetentionExecution: { groupBy: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: database }));

import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const repository of Object.values(database)) {
      repository.groupBy.mockResolvedValue([]);
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
});
