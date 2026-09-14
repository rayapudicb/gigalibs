import { prisma } from '@gigalibs/db';
import { logger } from '@gigalibs/logger';
import { Injectable } from '@nestjs/common';

const HTTP_DURATION_BUCKETS_SECONDS = Object.freeze([
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]);

interface HttpMetric {
  count: number;
  sumSeconds: number;
  buckets: number[];
}

interface HttpMetricKey {
  method: string;
  route: string;
  status: string;
}

interface Gauge {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const DATABASE_GAUGE_DEFINITIONS = Object.freeze({
  gigalibs_source_events: 'Durable source events by lifecycle status.',
  gigalibs_control_outbox_events: 'Durable control outbox events by lifecycle status.',
  gigalibs_connector_attempt_records: 'Persisted connector attempts by operation and status.',
  gigalibs_operational_exceptions: 'Operational exceptions by lifecycle status.',
  gigalibs_business_actions: 'Controlled business actions by lifecycle status.',
  gigalibs_retention_executions: 'Retention executions by lifecycle status.',
  gigalibs_configuration_change_sets: 'Configuration Studio change sets by governance status.',
  gigalibs_configuration_activations: 'Configuration Studio activations by lifecycle status.',
  gigalibs_configuration_published_versions: 'Immutable Configuration Studio versions.',
  gigalibs_configuration_records: 'Configuration Studio application records by lifecycle status.',
});

@Injectable()
export class MetricsService {
  private readonly startedAtSeconds = Date.now() / 1_000;
  private readonly http = new Map<string, HttpMetric>();
  private databaseCollectionFailures = 0;

  recordHttpRequest(input: {
    method: string;
    route: string | undefined;
    statusCode: number;
    durationSeconds: number;
  }) {
    const key: HttpMetricKey = {
      method: normalizeMethod(input.method),
      route: normalizeRoute(input.route),
      status: normalizeStatus(input.statusCode),
    };
    const encoded = JSON.stringify(key);
    const current = this.http.get(encoded) ?? {
      count: 0,
      sumSeconds: 0,
      buckets: HTTP_DURATION_BUCKETS_SECONDS.map(() => 0),
    };
    current.count += 1;
    current.sumSeconds += Math.max(0, input.durationSeconds);
    HTTP_DURATION_BUCKETS_SECONDS.forEach((upperBound, index) => {
      if (input.durationSeconds <= upperBound) {
        current.buckets[index] = (current.buckets[index] ?? 0) + 1;
      }
    });
    this.http.set(encoded, current);
  }

  async renderPrometheus(): Promise<string> {
    const lines = this.renderRuntimeAndHttpMetrics();
    let databaseCollectionSuccess = 1;
    let databaseGauges: Gauge[] = [];
    try {
      databaseGauges = await this.collectDatabaseGauges();
    } catch (error) {
      databaseCollectionSuccess = 0;
      this.databaseCollectionFailures += 1;
      logger.warn(
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Operational metrics database collector failed',
      );
    }

    lines.push(
      '# HELP gigalibs_metrics_collection_success Whether the named collector succeeded for this scrape.',
      '# TYPE gigalibs_metrics_collection_success gauge',
      `gigalibs_metrics_collection_success{collector="database"} ${databaseCollectionSuccess}`,
      '# HELP gigalibs_metrics_collection_failures_total Total collector failures since process start.',
      '# TYPE gigalibs_metrics_collection_failures_total counter',
      `gigalibs_metrics_collection_failures_total{collector="database"} ${this.databaseCollectionFailures}`,
    );
    for (const [name, help] of Object.entries(DATABASE_GAUGE_DEFINITIONS)) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    }
    for (const gauge of databaseGauges) {
      lines.push(`${gauge.name}${formatLabels(gauge.labels)} ${gauge.value}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private renderRuntimeAndHttpMetrics(): string[] {
    const memory = process.memoryUsage();
    const lines = [
      '# HELP process_start_time_seconds Start time of the process since unix epoch in seconds.',
      '# TYPE process_start_time_seconds gauge',
      `process_start_time_seconds ${this.startedAtSeconds}`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime()}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${memory.rss}`,
      '# HELP nodejs_heap_size_used_bytes Process heap memory used in bytes.',
      '# TYPE nodejs_heap_size_used_bytes gauge',
      `nodejs_heap_size_used_bytes ${memory.heapUsed}`,
      '# HELP gigalibs_http_requests_total Total completed HTTP requests.',
      '# TYPE gigalibs_http_requests_total counter',
      '# HELP gigalibs_http_request_duration_seconds Completed HTTP request duration in seconds.',
      '# TYPE gigalibs_http_request_duration_seconds histogram',
    ];

    for (const [encoded, metric] of [...this.http.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const key = JSON.parse(encoded) as HttpMetricKey;
      const labels = { method: key.method, route: key.route, status: key.status };
      lines.push(`gigalibs_http_requests_total${formatLabels(labels)} ${metric.count}`);
      HTTP_DURATION_BUCKETS_SECONDS.forEach((upperBound, index) => {
        lines.push(
          `gigalibs_http_request_duration_seconds_bucket${formatLabels({ ...labels, le: String(upperBound) })} ${metric.buckets[index]}`,
        );
      });
      lines.push(
        `gigalibs_http_request_duration_seconds_bucket${formatLabels({ ...labels, le: '+Inf' })} ${metric.count}`,
        `gigalibs_http_request_duration_seconds_sum${formatLabels(labels)} ${metric.sumSeconds}`,
        `gigalibs_http_request_duration_seconds_count${formatLabels(labels)} ${metric.count}`,
      );
    }
    return lines;
  }

  private async collectDatabaseGauges(): Promise<Gauge[]> {
    const [
      sourceEvents,
      outboxEvents,
      connectorAttempts,
      exceptions,
      actions,
      retentionExecutions,
      configurationChangeSets,
      configurationActivations,
      configurationPublishedVersions,
      activeConfigurationRecords,
      deletedConfigurationRecords,
    ] = await Promise.all([
      prisma.sourceEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.controlOutboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.connectorAttempt.groupBy({
        by: ['operation', 'status'],
        _count: { _all: true },
      }),
      prisma.operationalException.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.businessAction.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.dataRetentionExecution.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.configurationChangeSet.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.configurationActivation.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.configurationPublishedVersion.count(),
      prisma.configurationRecord.count({ where: { deletedAt: null } }),
      prisma.configurationRecord.count({ where: { deletedAt: { not: null } } }),
    ]);

    return [
      ...sourceEvents.map((row) =>
        gauge('gigalibs_source_events', { status: row.status }, row._count._all),
      ),
      ...outboxEvents.map((row) =>
        gauge('gigalibs_control_outbox_events', { status: row.status }, row._count._all),
      ),
      ...connectorAttempts.map((row) =>
        gauge(
          'gigalibs_connector_attempt_records',
          { operation: row.operation, status: row.status },
          row._count._all,
        ),
      ),
      ...exceptions.map((row) =>
        gauge('gigalibs_operational_exceptions', { status: row.status }, row._count._all),
      ),
      ...actions.map((row) =>
        gauge('gigalibs_business_actions', { status: row.status }, row._count._all),
      ),
      ...retentionExecutions.map((row) =>
        gauge('gigalibs_retention_executions', { status: row.status }, row._count._all),
      ),
      ...configurationChangeSets.map((row) =>
        gauge('gigalibs_configuration_change_sets', { status: row.status }, row._count._all),
      ),
      ...configurationActivations.map((row) =>
        gauge('gigalibs_configuration_activations', { status: row.status }, row._count._all),
      ),
      gauge('gigalibs_configuration_published_versions', {}, configurationPublishedVersions),
      gauge('gigalibs_configuration_records', { status: 'ACTIVE' }, activeConfigurationRecords),
      gauge('gigalibs_configuration_records', { status: 'DELETED' }, deletedConfigurationRecords),
    ];
  }
}

function gauge(name: string, labels: Record<string, string>, value: number): Gauge {
  return { name, labels, value };
}

function normalizeMethod(method: string): string {
  const upper = method.toUpperCase();
  return /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(upper) ? upper : 'OTHER';
}

function normalizeRoute(route: string | undefined): string {
  if (!route || !route.startsWith('/') || route.length > 256) return 'unmatched';

  // Express 5 represents Nest's not-found handler as a wildcard route. Keeping
  // the template is cardinality-safe, but calling it "unmatched" makes the
  // operational meaning stable if the framework changes its catch-all syntax.
  if (route.includes('*')) return 'unmatched';

  return route;
}

function normalizeStatus(statusCode: number): string {
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
    ? String(statusCode)
    : 'unknown';
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}
