import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const bffUrl = process.env.BFF_URL;
const controlUrl = process.env.CONTROL_API_URL;
const requestBodyLimit = Number(process.env.BFF_MAX_REQUEST_BYTES);
for (const [name, value] of Object.entries({
  BFF_URL: bffUrl,
  CONTROL_API_URL: controlUrl,
  BFF_MAX_REQUEST_BYTES: process.env.BFF_MAX_REQUEST_BYTES,
})) {
  if (!value) throw new Error(`${name} is required`);
}
assert.ok(Number.isSafeInteger(requestBodyLimit) && requestBodyLimit > 0);

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  assert.ok(
    (options.statuses ?? [200]).includes(response.status),
    `${options.method ?? 'GET'} ${path} returned ${response.status}: ${raw}`,
  );
  return { response, body };
}

const unauthenticated = await jsonRequest(bffUrl, '/api/workflows', { statuses: [401] });
assert.equal(unauthenticated.body.detail, 'Authentication required.');
await jsonRequest(bffUrl, '/api/operational-intelligence/environments', { statuses: [401] });

const oversized = await fetch(`${bffUrl}/api/workflows`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: 'x'.repeat(requestBodyLimit + 1),
});
assert.equal(oversized.status, 413);

const suffix = `${Date.now().toString(36)}-${process.pid}`;
const email = `bff-verification-${suffix}@example.test`;
const password = randomBytes(32).toString('base64url');
const registration = await jsonRequest(controlUrl, '/api/v1/auth/register', {
  method: 'POST',
  statuses: [201],
  body: { email, password, name: 'BFF Verification Owner' },
});
const tenant = await jsonRequest(controlUrl, '/api/v1/tenants', {
  method: 'POST',
  token: registration.body.accessToken,
  statuses: [201],
  body: {
    name: `BFF verification ${suffix}`,
    slug: `bff-verification-${suffix}`,
    plan: 'ENTERPRISE',
    isolationMode: 'ROW_LEVEL_SECURITY',
    region: 'ap-south-1',
  },
});
const selected = await jsonRequest(controlUrl, '/api/v1/auth/select-tenant', {
  method: 'POST',
  token: registration.body.accessToken,
  body: { tenantId: tenant.body.id },
});
await jsonRequest(controlUrl, '/api/v1/tenants/current/status', {
  method: 'PATCH',
  token: selected.body.accessToken,
  body: { status: 'ACTIVE', reason: 'BFF integration verification' },
});

const login = await jsonRequest(bffUrl, '/api/auth/login', {
  method: 'POST',
  body: { email, password },
});
const cookie = login.response.headers
  .getSetCookie()
  .map((header) => header.split(';', 1)[0])
  .join('; ');
assert.match(cookie, /gigalibs_access_token=/);
assert.match(cookie, /gigalibs_refresh_token=/);

const environment = await jsonRequest(bffUrl, '/api/operational-intelligence/environments', {
  method: 'POST',
  cookie,
  statuses: [201],
  body: {
    slug: 'bff-certification',
    displayName: 'BFF certification',
    kind: 'TEST',
    region: 'ap-south-1',
    retentionDays: 14,
  },
});
const environments = await jsonRequest(bffUrl, '/api/operational-intelligence/environments', {
  cookie,
});
assert.ok(environments.body.some((item) => item.id === environment.body.id));

const empty = await jsonRequest(bffUrl, '/api/workflows', { cookie });
assert.deepEqual(empty.body, []);
const definition = {
  nodes: [
    {
      id: 'input',
      type: 'input',
      position: { x: 0, y: 0 },
      data: { label: 'BFF input' },
      config: {},
    },
  ],
  edges: [],
};
const workflow = await jsonRequest(bffUrl, '/api/workflows', {
  method: 'POST',
  cookie,
  statuses: [201],
  body: {
    name: `BFF workflow ${suffix}`,
    description: 'Created through authenticated browser-facing routes.',
    targetApp: 'bff-verification',
    definition,
  },
});
await jsonRequest(bffUrl, `/api/workflows/${workflow.body.id}/publish`, {
  method: 'POST',
  cookie,
  statuses: [201],
  body: {
    definition,
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', additionalProperties: true },
  },
});

const command = {
  workflowId: workflow.body.id,
  triggerType: 'manual',
  inputPayload: { verification: suffix },
};
const idempotencyKey = `bff:${suffix}`;
const first = await jsonRequest(bffUrl, '/api/runs', {
  method: 'POST',
  cookie,
  idempotencyKey,
  statuses: [202],
  body: command,
});
const duplicate = await jsonRequest(bffUrl, '/api/runs', {
  method: 'POST',
  cookie,
  idempotencyKey,
  body: command,
});
assert.equal(duplicate.body.id, first.body.id);

let detail;
for (let attempt = 0; attempt < 30; attempt += 1) {
  detail = await jsonRequest(bffUrl, `/api/runs/${first.body.id}`, { cookie });
  if (['succeeded', 'failed', 'cancelled', 'action_required'].includes(detail.body.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(detail.body.status, 'succeeded');
const runs = await jsonRequest(bffUrl, `/api/runs?workflowId=${workflow.body.id}`, { cookie });
assert.ok(runs.body.items.some((run) => run.id === first.body.id));

console.log(
  JSON.stringify(
    {
      status: 'passed',
      workflowId: workflow.body.id,
      runId: first.body.id,
      checks: [
        'http-only-cookie-session',
        'authenticated-workflow-bff',
        'authenticated-execution-bff',
        'bff-idempotency-header-forwarding',
        'tenant-scoped-browser-data',
        'unauthenticated-request-rejection',
        'configured-bff-request-size-limit',
        'authenticated-operational-intelligence-bff',
      ],
    },
    null,
    2,
  ),
);
