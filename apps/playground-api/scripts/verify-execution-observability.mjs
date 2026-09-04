import assert from 'node:assert/strict';

const executionUrl = process.env.EXECUTION_PLANE_API_URL;
const token = process.env.OBSERVABILITY_METRICS_TOKEN;
if (!executionUrl) throw new Error('EXECUTION_PLANE_API_URL is required');
if (!token || token.length < 32) {
  throw new Error('OBSERVABILITY_METRICS_TOKEN must contain at least 32 characters');
}

async function scrape(authorization, correlationId) {
  const response = await fetch(`${executionUrl}/api/v1/internal/metrics`, {
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
    },
  });
  return {
    status: response.status,
    correlationId: response.headers.get('x-correlation-id') ?? '',
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

assert.equal((await scrape()).status, 401);
assert.equal((await scrape(`Bearer ${'0'.repeat(32)}`)).status, 401);

const invalidCorrelationId = 'invalid correlation value';
const deniedResponse = await fetch(`${executionUrl}/api/v1/runs`, {
  headers: { 'X-Correlation-ID': invalidCorrelationId },
});
assert.equal(deniedResponse.status, 401);
assert.match(deniedResponse.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/);
assert.notEqual(deniedResponse.headers.get('x-correlation-id'), invalidCorrelationId);

const result = await scrape(`Bearer ${token}`, invalidCorrelationId);
assert.equal(result.status, 200);
assert.match(result.contentType, /^text\/plain/);
assert.match(result.correlationId, /^[0-9a-f-]{36}$/);
assert.notEqual(result.correlationId, invalidCorrelationId);
for (const metric of [
  'gigalibs_execution_metrics_collection_success{collector="database"} 1',
  'gigalibs_execution_runs',
  'gigalibs_execution_steps',
  'gigalibs_execution_outbox_events',
]) {
  assert.ok(result.body.includes(metric), `Metrics output is missing ${metric}`);
}
assert.doesNotMatch(result.body, /(?:tenantId|tenant_id|runId|run_id|workflowId|workflow_id)=/);
assert.doesNotMatch(result.body, /@example\.(?:test|com)/);

console.log(
  JSON.stringify(
    {
      status: 'passed',
      checks: [
        'missing-scraper-credential-rejected',
        'invalid-scraper-credential-rejected',
        'dedicated-configured-scraper-authentication',
        'prometheus-content-contract',
        'execution-database-collector-health',
        'durable-run-step-outbox-state',
        'invalid-correlation-value-replaced',
        'early-authentication-failure-correlated',
        'tenant-and-entity-label-non-disclosure',
      ],
    },
    null,
    2,
  ),
);
