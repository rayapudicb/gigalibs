import { prisma } from '@gigalibs/db';
import { logger } from '@gigalibs/logger';
import { Injectable } from '@nestjs/common';
import { ConfigurationManifestCache } from './configuration-manifest.cache.js';
import { ConfigurationRuntimeMetrics } from './configuration-runtime.metrics.js';

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
  gigalibs_configuration_outbox_events:
    'Configuration Studio outbox events by bounded delivery status.',
  gigalibs_configuration_outbox_oldest_pending_age_seconds:
    'Age in seconds of the oldest pending Configuration Studio outbox event.',
  gigalibs_configuration_submitted_change_sets_older_than_24h:
    'Configuration Studio change sets awaiting review for more than 24 hours.',
});

const CONFIGURATION_OUTBOX_AGGREGATES = Object.freeze([
  'configuration-version',
  'configuration-activation',
  'configuration-record',
]);

@Injectable()
export class MetricsService {
  private readonly startedAtSeconds = Date.now() / 1_000;
  private readonly http = new Map<string, HttpMetric>();
  private databaseCollectionFailures = 0;

  constructor(
    private readonly configurationManifestCache: ConfigurationManifestCache = new ConfigurationManifestCache(),
    private readonly configurationRuntimeMetrics: ConfigurationRuntimeMetrics = new ConfigurationRuntimeMetrics(),
  ) {}

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
    const manifestCache = this.configurationManifestCache.snapshot();
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
      '# HELP gigalibs_configuration_manifest_listener_connected Whether the PostgreSQL configuration invalidation listener is connected.',
      '# TYPE gigalibs_configuration_manifest_listener_connected gauge',
      `gigalibs_configuration_manifest_listener_connected ${manifestCache.listenerConnected ? 1 : 0}`,
      '# HELP gigalibs_configuration_manifest_cache_entries Number of bounded manifest cache entries.',
      '# TYPE gigalibs_configuration_manifest_cache_entries gauge',
      `gigalibs_configuration_manifest_cache_entries ${manifestCache.entries}`,
      '# HELP gigalibs_configuration_manifest_cache_requests_total Manifest cache requests by bounded result.',
      '# TYPE gigalibs_configuration_manifest_cache_requests_total counter',
      `gigalibs_configuration_manifest_cache_requests_total{result="hit"} ${manifestCache.hit}`,
      `gigalibs_configuration_manifest_cache_requests_total{result="miss"} ${manifestCache.miss}`,
      `gigalibs_configuration_manifest_cache_requests_total{result="bypass"} ${manifestCache.bypass}`,
      '# HELP gigalibs_configuration_manifest_consumer_notifications_total Configuration invalidation notifications by bounded result.',
      '# TYPE gigalibs_configuration_manifest_consumer_notifications_total counter',
      `gigalibs_configuration_manifest_consumer_notifications_total{result="applied"} ${manifestCache.notificationApplied}`,
      `gigalibs_configuration_manifest_consumer_notifications_total{result="deduplicated"} ${manifestCache.notificationDeduplicated}`,
      `gigalibs_configuration_manifest_consumer_notifications_total{result="ignored"} ${manifestCache.notificationIgnored}`,
      `gigalibs_configuration_manifest_consumer_notifications_total{result="invalid"} ${manifestCache.notificationInvalid}`,
      `gigalibs_configuration_manifest_consumer_notifications_total{result="failed"} ${manifestCache.notificationFailed}`,
      '# HELP gigalibs_configuration_manifest_resynchronizations_total Authoritative manifest resynchronizations by bounded result.',
      '# TYPE gigalibs_configuration_manifest_resynchronizations_total counter',
      `gigalibs_configuration_manifest_resynchronizations_total{result="success"} ${manifestCache.resynchronizationSucceeded}`,
      `gigalibs_configuration_manifest_resynchronizations_total{result="failed"} ${manifestCache.resynchronizationFailed}`,
      '# HELP gigalibs_configuration_manifest_reconnects_total Successful configuration listener reconnects.',
      '# TYPE gigalibs_configuration_manifest_reconnects_total counter',
      `gigalibs_configuration_manifest_reconnects_total ${manifestCache.reconnects}`,
      '# HELP gigalibs_configuration_runtime_requests_total Configuration runtime requests by bounded operation and result.',
      '# TYPE gigalibs_configuration_runtime_requests_total counter',
    ];

    for (const metric of this.configurationRuntimeMetrics.snapshot()) {
      lines.push(
        `gigalibs_configuration_runtime_requests_total${formatLabels({ operation: metric.operation, result: metric.result })} ${metric.count}`,
      );
    }

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
      configurationOutboxEvents,
      oldestPendingConfigurationOutbox,
      staleSubmittedConfigurationChangeSets,
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
      prisma.controlOutboxEvent.groupBy({
        by: ['status'],
        where: { aggregateType: { in: [...CONFIGURATION_OUTBOX_AGGREGATES] } },
        _count: { _all: true },
      }),
      prisma.controlOutboxEvent.aggregate({
        where: {
          status: 'PENDING',
          aggregateType: { in: [...CONFIGURATION_OUTBOX_AGGREGATES] },
        },
        _min: { createdAt: true },
      }),
      prisma.configurationChangeSet.count({
        where: {
          status: 'SUBMITTED',
          updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
        },
      }),
    ]);

    const oldestPendingAgeSeconds = oldestPendingConfigurationOutbox._min.createdAt
      ? Math.max(
          0,
          (Date.now() - oldestPendingConfigurationOutbox._min.createdAt.getTime()) / 1_000,
        )
      : 0;

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
      ...configurationOutboxEvents.map((row) =>
        gauge('gigalibs_configuration_outbox_events', { status: row.status }, row._count._all),
      ),
      gauge(
        'gigalibs_configuration_outbox_oldest_pending_age_seconds',
        {},
        oldestPendingAgeSeconds,
      ),
      gauge(
        'gigalibs_configuration_submitted_change_sets_older_than_24h',
        {},
        staleSubmittedConfigurationChangeSets,
      ),
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
