import assert from 'node:assert/strict';

const apiUrl = process.env.API_URL;
const token = process.env.OBSERVABILITY_METRICS_TOKEN;
if (!apiUrl) throw new Error('API_URL is required');
if (!token || token.length < 32) {
  throw new Error('OBSERVABILITY_METRICS_TOKEN must contain at least 32 characters');
}

async function scrape(authorization) {
  const response = await fetch(`${apiUrl}/internal/metrics`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

assert.equal((await scrape()).status, 401);
assert.equal((await scrape(`Bearer ${'0'.repeat(32)}`)).status, 401);

const invalidCorrelationId = 'invalid correlation value';
const healthResponse = await fetch(`${apiUrl}/health`, {
  headers: { 'X-Correlation-ID': invalidCorrelationId },
});
assert.equal(healthResponse.status, 200);
assert.match(healthResponse.headers.get('x-correlation-id') ?? '', /^[a-f0-9]{16}$/);
assert.notEqual(healthResponse.headers.get('x-correlation-id'), invalidCorrelationId);
await fetch(`${apiUrl}/route-that-does-not-exist`);
const result = await scrape(`Bearer ${token}`);
assert.equal(result.status, 200);
assert.match(result.contentType, /^text\/plain/);
for (const metric of [
  'process_start_time_seconds',
  'process_resident_memory_bytes',
  'gigalibs_http_requests_total',
  'gigalibs_http_request_duration_seconds_bucket',
  'gigalibs_metrics_collection_success{collector="database"} 1',
  'gigalibs_source_events',
  'gigalibs_control_outbox_events',
  'gigalibs_connector_attempt_records',
  'gigalibs_operational_exceptions',
  'gigalibs_business_actions',
  'gigalibs_retention_executions',
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
]) {
  assert.ok(result.body.includes(metric), `Metrics output is missing ${metric}`);
}
assert.match(result.body, /route="(?:\/api\/v1\/)?health"/);
assert.match(result.body, /route="unmatched",status="404"/);
assert.doesNotMatch(result.body, /route-that-does-not-exist/);
assert.doesNotMatch(result.body, /@example\.(?:test|com)/);
assert.doesNotMatch(result.body, /(?:tenantId|userId|eventId|sourceConnectionId)=/);

console.log(
  JSON.stringify(
    {
      status: 'passed',
      checks: [
        'missing-scraper-credential-rejected',
        'invalid-scraper-credential-rejected',
        'dedicated-configured-scraper-authentication',
        'prometheus-content-contract',
        'real-process-and-request-measurements',
        'registered-route-template-cardinality',
        'unmatched-route-value-redaction',
        'invalid-correlation-value-replaced',
        'durable-database-operational-state',
        'database-collector-health-signal',
        'tenant-identity-and-payload-non-disclosure',
      ],
    },
    null,
    2,
  ),
);
