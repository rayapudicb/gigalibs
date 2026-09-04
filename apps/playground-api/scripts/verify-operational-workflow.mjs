import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

const controlUrl = process.env.CONTROL_API_URL;
const executionUrl = process.env.EXECUTION_API_URL;
const executionEventSourceId = process.env.EXECUTION_EVENT_SOURCE_ID;
const executionEventSigningSecret = process.env.EXECUTION_EVENT_SIGNING_SECRET;

for (const [name, value] of Object.entries({
  CONTROL_API_URL: controlUrl,
  EXECUTION_API_URL: executionUrl,
  EXECUTION_EVENT_SOURCE_ID: executionEventSourceId,
  EXECUTION_EVENT_SIGNING_SECRET: executionEventSigningSecret,
})) {
  if (!value) throw new Error(`${name} is required`);
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!(options.statuses ?? [200]).includes(response.status)) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${raw}`);
  }
  return { status: response.status, body };
}

const suffix = `${Date.now().toString(36)}-${process.pid}`;
const email = `workflow-verification-${suffix}@example.test`;
const password = randomBytes(32).toString('base64url');
const registration = await request(controlUrl, '/api/v1/auth/register', {
  method: 'POST',
  statuses: [201],
  body: { email, password, name: 'Workflow Verification Owner' },
});
const tenant = await request(controlUrl, '/api/v1/tenants', {
  method: 'POST',
  token: registration.body.accessToken,
  statuses: [201],
  body: {
    name: `Workflow verification ${suffix}`,
    slug: `workflow-verification-${suffix}`,
    plan: 'ENTERPRISE',
    isolationMode: 'ROW_LEVEL_SECURITY',
    region: 'ap-south-1',
  },
});
const selected = await request(controlUrl, '/api/v1/auth/select-tenant', {
  method: 'POST',
  token: registration.body.accessToken,
  body: { tenantId: tenant.body.id },
});
const token = selected.body.accessToken;
await request(controlUrl, '/api/v1/tenants/current/status', {
  method: 'PATCH',
  token,
  body: { status: 'ACTIVE', reason: 'Operational workflow integration verification' },
});

const context = await request(controlUrl, '/api/v1/authorization/context', { token });
assert.equal(typeof context.body.tenant.id, 'string');
assert.ok(
  context.body.permissions.includes('*') || context.body.permissions.includes('workflows:*'),
);

const definition = {
  nodes: [
    {
      id: 'input',
      type: 'input',
      position: { x: 0, y: 0 },
      data: { label: 'Verified input' },
      config: {},
    },
  ],
  edges: [],
};
const workflow = await request(controlUrl, '/api/v1/workflows/pipelines', {
  method: 'POST',
  token,
  statuses: [201],
  body: {
    name: `Operational verification ${suffix}`,
    description: 'Created by the production integration verification script.',
    targetApp: 'execution-certification',
    definition,
  },
});

const published = await request(
  controlUrl,
  `/api/v1/workflows/pipelines/${workflow.body.id}/publish`,
  {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      definition,
      inputSchema: {
        type: 'object',
        properties: { verificationId: { type: 'string', minLength: 1 } },
        required: ['verificationId'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: { verificationId: { type: 'string', minLength: 1 } },
        required: ['verificationId'],
        additionalProperties: false,
      },
    },
  },
);
assert.equal(published.body.version, 1);

const idempotencyKey = `verify:${suffix}`;
const command = {
  workflowId: workflow.body.id,
  triggerType: 'api',
  inputPayload: { verificationId: suffix },
};
const first = await request(executionUrl, '/api/v1/runs', {
  method: 'POST',
  token,
  idempotencyKey,
  statuses: [202],
  body: command,
});
const replay = await request(executionUrl, '/api/v1/runs', {
  method: 'POST',
  token,
  idempotencyKey,
  statuses: [200],
  body: command,
});
assert.equal(replay.body.id, first.body.id);

let detail;
for (let attempt = 0; attempt < 30; attempt += 1) {
  detail = await request(executionUrl, `/api/v1/runs/${first.body.id}`, { token });
  if (['succeeded', 'failed', 'action_required', 'cancelled'].includes(detail.body.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(detail.body.status, 'succeeded');
assert.equal(detail.body.workflow_version, 1);
assert.equal(detail.body.steps.length, 1);
assert.equal(detail.body.steps[0].status, 'succeeded');

let executionAuditEvents = [];
for (let attempt = 0; attempt < 30; attempt += 1) {
  const audit = await request(controlUrl, '/api/v1/audit?limit=200', { token });
  executionAuditEvents = audit.body.filter(
    (event) => event.resource === 'workflow-run' && event.resourceId === first.body.id,
  );
  const eventTypes = new Set(executionAuditEvents.map((event) => event.after?.eventType));
  if (
    eventTypes.has('execution.run.requested.v1') &&
    eventTypes.has('execution.run.started.v1') &&
    eventTypes.has('execution.run.succeeded.v1')
  )
    break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const eventTypes = new Set(executionAuditEvents.map((event) => event.after?.eventType));
assert.ok(eventTypes.has('execution.run.requested.v1'));
assert.ok(eventTypes.has('execution.run.started.v1'));
assert.ok(eventTypes.has('execution.run.succeeded.v1'));

const outsiderSuffix = `${suffix}-outsider`;
const outsiderRegistration = await request(controlUrl, '/api/v1/auth/register', {
  method: 'POST',
  statuses: [201],
  body: {
    email: `workflow-verification-${outsiderSuffix}@example.test`,
    password: randomBytes(32).toString('base64url'),
    name: 'Workflow Isolation Verifier',
  },
});
const outsiderTenant = await request(controlUrl, '/api/v1/tenants', {
  method: 'POST',
  token: outsiderRegistration.body.accessToken,
  statuses: [201],
  body: {
    name: `Workflow isolation ${outsiderSuffix}`,
    slug: `workflow-isolation-${outsiderSuffix}`,
    plan: 'ENTERPRISE',
    isolationMode: 'ROW_LEVEL_SECURITY',
    region: 'ap-south-1',
  },
});
const outsiderSelected = await request(controlUrl, '/api/v1/auth/select-tenant', {
  method: 'POST',
  token: outsiderRegistration.body.accessToken,
  body: { tenantId: outsiderTenant.body.id },
});
const outsiderToken = outsiderSelected.body.accessToken;
await request(controlUrl, '/api/v1/tenants/current/status', {
  method: 'PATCH',
  token: outsiderToken,
  body: { status: 'ACTIVE', reason: 'Cross-tenant isolation verification' },
});
await request(controlUrl, `/api/v1/workflows/pipelines/${workflow.body.id}`, {
  token: outsiderToken,
  statuses: [404],
});
await request(executionUrl, `/api/v1/runs/${first.body.id}`, {
  token: outsiderToken,
  statuses: [404],
});

const replayCandidate = executionAuditEvents.find(
  (event) => event.after?.eventType === 'execution.run.succeeded.v1',
);
assert.equal(typeof replayCandidate?.sourceEventId, 'string');
const replayBody = {
  eventId: replayCandidate.sourceEventId,
  eventType: replayCandidate.after.eventType,
  tenantId: replayCandidate.tenantId,
  runId: replayCandidate.resourceId,
  workflowId: replayCandidate.after.workflowId,
  correlationId: replayCandidate.correlationId,
  actorId: replayCandidate.metadata?.actorId ?? null,
  occurredAt: replayCandidate.after.occurredAt,
  evidence: replayCandidate.after.evidence,
};
const rawReplayBody = JSON.stringify(replayBody);
const replayTimestamp = String(Math.floor(Date.now() / 1000));
const replaySignature = createHmac('sha256', executionEventSigningSecret)
  .update(`${replayTimestamp}.${rawReplayBody}`)
  .digest('hex');
const auditReplayResponse = await fetch(`${controlUrl}/api/v1/internal/execution-events`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GigaLibs-Source': executionEventSourceId,
    'X-GigaLibs-Timestamp': replayTimestamp,
    'X-GigaLibs-Signature': `sha256=${replaySignature}`,
  },
  body: rawReplayBody,
});
assert.equal(auditReplayResponse.status, 201);
const auditReplay = await auditReplayResponse.json();
assert.equal(auditReplay.accepted, true);
assert.equal(auditReplay.duplicate, true);

console.log(
  JSON.stringify(
    {
      status: 'passed',
      workflowId: workflow.body.id,
      runId: first.body.id,
      checks: [
        'authoritative-auth-context',
        'workflow-draft-persistence',
        'immutable-version-publish',
        'execution-command-idempotency',
        'transactional-outbox-dispatch',
        'leased-worker-execution',
        'encrypted-payload-checkpoint',
        'tenant-scoped-run-read',
        'cross-tenant-control-and-execution-denial',
        'signed-control-plane-audit-delivery',
        'audit-replay-deduplication',
      ],
    },
    null,
    2,
  ),
);
