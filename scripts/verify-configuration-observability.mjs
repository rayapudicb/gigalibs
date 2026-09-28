import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metricsSourcePath = resolve(repositoryRoot, 'apps/playground-api/src/metrics.service.ts');
const liveVerifierPath = resolve(
  repositoryRoot,
  'apps/playground-api/scripts/verify-observability.mjs',
);
const alertRulesPath = resolve(repositoryRoot, 'infra/prometheus/alerts.yml');
const dashboardPath = resolve(repositoryRoot, 'infra/grafana/dashboards/configuration-studio.json');
const runbookPath = resolve(repositoryRoot, 'docs/runbooks/configuration-studio-operations.md');
const evidencePath = process.env.CONFIGURATION_OBSERVABILITY_EVIDENCE_PATH?.trim();

const [metricsSource, liveVerifierSource, alertRulesRaw, dashboardRaw, runbook] = await Promise.all(
  [
    readFile(metricsSourcePath, 'utf8'),
    readFile(liveVerifierPath, 'utf8'),
    readFile(alertRulesPath, 'utf8'),
    readFile(dashboardPath, 'utf8'),
    readFile(runbookPath, 'utf8'),
  ],
);

const alertDocument = yaml.load(alertRulesRaw);
assert.ok(alertDocument && typeof alertDocument === 'object' && !Array.isArray(alertDocument));
const dashboard = JSON.parse(dashboardRaw);

const configurationMetrics = [
  'gigalibs_configuration_change_sets',
  'gigalibs_configuration_activations',
  'gigalibs_configuration_published_versions',
  'gigalibs_configuration_records',
  'gigalibs_configuration_outbox_events',
  'gigalibs_configuration_outbox_oldest_pending_age_seconds',
  'gigalibs_configuration_submitted_change_sets_older_than_24h',
  'gigalibs_configuration_manifest_listener_connected',
  'gigalibs_configuration_manifest_cache_entries',
  'gigalibs_configuration_manifest_cache_requests_total',
  'gigalibs_configuration_manifest_consumer_notifications_total',
  'gigalibs_configuration_manifest_resynchronizations_total',
  'gigalibs_configuration_manifest_reconnects_total',
];
const sharedOperationalMetrics = [
  'gigalibs_http_requests_total',
  'gigalibs_http_request_duration_seconds_bucket',
  'gigalibs_metrics_collection_success',
];

for (const metric of configurationMetrics) {
  assert.ok(metricsSource.includes(metric), `Metrics producer is missing ${metric}.`);
  assert.ok(liveVerifierSource.includes(metric), `Live scrape verifier is missing ${metric}.`);
}
for (const metric of sharedOperationalMetrics) {
  assert.ok(metricsSource.includes(metric), `Metrics producer is missing ${metric}.`);
}

const groups = alertDocument.groups;
assert.ok(Array.isArray(groups), 'Prometheus alert document must contain groups.');
const configurationGroup = groups.find(
  (group) => group.name === 'gigalibs-configuration-studio-alerts',
);
assert.ok(configurationGroup, 'Configuration Studio alert group is missing.');
assert.ok(Array.isArray(configurationGroup.rules), 'Configuration Studio alert rules are missing.');

const expectedAlerts = [
  'ConfigurationStudioOutboxFailed',
  'ConfigurationStudioOutboxPendingTooLong',
  'ConfigurationStudioReviewBacklogStale',
  'ConfigurationStudioReadP95LatencyHigh',
  'ConfigurationStudioDatabaseUnavailable',
  'ConfigurationStudioManifestConsumerDisconnected',
];
assert.deepEqual(
  configurationGroup.rules.map((rule) => rule.alert).sort(),
  [...expectedAlerts].sort(),
  'Configuration Studio alert set has drifted.',
);
for (const rule of configurationGroup.rules) {
  assert.equal(rule.labels?.module, 'configuration-studio');
  assert.ok(['warning', 'critical'].includes(rule.labels?.severity));
  assert.equal(
    rule.annotations?.runbook_url,
    'docs/runbooks/configuration-studio-operations.md',
    `${rule.alert} must route to the module operations runbook.`,
  );
  assert.equal(typeof rule.expr, 'string');
  assert.ok(rule.expr.length > 0, `${rule.alert} must have a PromQL expression.`);
}
assert.doesNotMatch(
  configurationGroup.rules.map((rule) => rule.expr).join('\n'),
  /\{[^}]*\bstate=/,
  'Configuration Studio alerts must use the emitted outbox status label.',
);

const configurationAlertExpressions = configurationGroup.rules.map((rule) => rule.expr).join('\n');
for (const metric of [
  'gigalibs_configuration_outbox_events',
  'gigalibs_configuration_outbox_oldest_pending_age_seconds',
  'gigalibs_configuration_submitted_change_sets_older_than_24h',
  'gigalibs_http_request_duration_seconds_bucket',
  'gigalibs_http_requests_total',
  'gigalibs_configuration_manifest_listener_connected',
]) {
  assert.ok(
    configurationAlertExpressions.includes(metric),
    `Configuration alert rules do not consume ${metric}.`,
  );
}

assert.equal(dashboard.uid, 'gigalibs-configuration-studio');
assert.equal(dashboard.title, 'GigaLibs Configuration Studio Operations');
for (const tag of ['gigalibs', 'configuration-studio', 'wi-oi-039']) {
  assert.ok(dashboard.tags?.includes(tag), `Dashboard is missing tag ${tag}.`);
}
assert.ok(Array.isArray(dashboard.panels));
assert.ok(
  dashboard.panels.length >= 10,
  'Dashboard must contain the ten required operator panels.',
);
const panelIds = dashboard.panels.map((panel) => panel.id);
assert.equal(new Set(panelIds).size, panelIds.length, 'Dashboard panel IDs must be unique.');
const dashboardExpressions = dashboard.panels
  .flatMap((panel) => panel.targets ?? [])
  .map((target) => target.expr)
  .filter((expression) => typeof expression === 'string');
assert.equal(
  dashboardExpressions.length,
  dashboard.panels.length,
  'Every Configuration Studio dashboard panel must contain a Prometheus target.',
);
const dashboardPromQl = dashboardExpressions.join('\n');
for (const metric of [
  ...configurationMetrics.filter(
    (metric) => metric !== 'gigalibs_configuration_published_versions',
  ),
  ...sharedOperationalMetrics,
]) {
  assert.ok(dashboardPromQl.includes(metric), `Dashboard does not consume ${metric}.`);
}
assert.doesNotMatch(
  `${dashboardRaw}\n${dashboardPromQl}`,
  /\b(?:tenantId|userId|recordId|eventId|sourceConnectionId)\b/,
  'Dashboard must not expose high-cardinality customer or record identifiers.',
);

for (const requiredRunbookText of [
  'PostgreSQL',
  'Retry-After: 1',
  'Never bypass',
  'direct SQL below is read-only',
  'reconcile',
  'rollback API',
  'both deployment profiles',
  'fired-and-resolved alert evidence',
]) {
  assert.ok(
    runbook.toLowerCase().includes(requiredRunbookText.toLowerCase()),
    `Operations runbook is missing required guidance: ${requiredRunbookText}.`,
  );
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const evidence = {
  recordedAt: new Date().toISOString(),
  certification: 'WI-OI-039-configuration-observability-static-conformance',
  metricCount: configurationMetrics.length,
  alertCount: configurationGroup.rules.length,
  dashboardPanelCount: dashboard.panels.length,
  artifacts: {
    metricsSourceSha256: sha256(metricsSource),
    liveVerifierSha256: sha256(liveVerifierSource),
    alertRulesSha256: sha256(alertRulesRaw),
    dashboardSha256: sha256(dashboardRaw),
    runbookSha256: sha256(runbook),
  },
  outcomes: [
    'configuration-metrics-are-produced-and-required-by-live-scrape-verifier',
    'prometheus-configuration-alert-group-parses-with-six-expected-rules',
    'configuration-alerts-use-emitted-status-label-and-module-runbook',
    'alert-expressions-cover-failure-delay-review-latency-and-database-unavailability',
    'grafana-dashboard-parses-with-unique-panels-and-required-operational-signals',
    'dashboard-avoids-tenant-user-record-and-event-cardinality',
    'runbook-preserves-authoritative-persistence-reconciliation-and-governed-rollback',
    'runbook-distinguishes-static-wiring-from-both-profile-live-acceptance',
  ],
  outcomeCount: 8,
  limitations: [
    'This is static wiring conformance; it does not prove a deployed Prometheus scrape or Grafana import.',
    'Fired-and-resolved alert routing and notification delivery have not been rehearsed.',
    'An independent operator must execute the outage, backlog and rollback scenarios in cloud and customer-managed profiles.',
  ],
  releaseAcceptance: false,
};

if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
