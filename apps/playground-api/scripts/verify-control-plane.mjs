import assert from 'node:assert/strict';

const baseUrl = process.env.API_URL;
if (!baseUrl) throw new Error('API_URL is required');

async function request(path, options = {}) {
  const {
    expectedStatus = 200,
    token,
    tenantId,
    body,
    method = 'GET',
  } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  if (tenantId !== undefined) headers['X-Tenant-ID'] = tenantId;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  const payload = raw.length > 0 ? JSON.parse(raw) : null;
  const acceptedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  assert.ok(
    acceptedStatuses.includes(response.status),
    `${method} ${path} returned ${response.status}: ${raw}`,
  );
  return payload;
}

const suffix = `${Date.now().toString(36)}-${process.pid}`;
const email = `control-plane-${suffix}@example.test`;
const slug = `control-plane-${suffix}`;

const ready = await request('/ready');
assert.equal(ready.database, 'connected');

const invalidRegistration = await request('/auth/register', {
  method: 'POST',
  body: { email, password: 'short', name: 'Control Plane Owner' },
  expectedStatus: 400,
});
assert.equal(invalidRegistration.code, 'VALIDATION_ERROR');

const registration = await request('/auth/register', {
  method: 'POST',
  body: {
    email,
    password: 'correct horse battery staple',
    name: 'Control Plane Owner',
  },
  expectedStatus: 201,
});
assert.equal(registration.tokenType, 'Bearer');

const tenant = await request('/tenants', {
  method: 'POST',
  token: registration.accessToken,
  body: {
    name: 'Control Plane Verification',
    slug,
    plan: 'ENTERPRISE',
    isolationMode: 'ROW_LEVEL_SECURITY',
    region: 'ap-south-1',
  },
  expectedStatus: 201,
});
assert.equal(tenant.status, 'PROVISIONING');

const tenants = await request('/tenants', { token: registration.accessToken });
assert.ok(tenants.some((item) => item.id === tenant.id && item.membershipRole === 'TENANT_ADMIN'));

const selected = await request('/auth/select-tenant', {
  method: 'POST',
  token: registration.accessToken,
  body: { tenantId: tenant.id },
});

const activeTenant = await request('/tenants/current/status', {
  method: 'PATCH',
  token: selected.accessToken,
  tenantId: tenant.id,
  body: { status: 'ACTIVE', reason: 'Runtime verification completed' },
});
assert.equal(activeTenant.status, 'ACTIVE');
assert.ok(activeTenant.provisionedAt);

const currentTenant = await request('/tenants/current', {
  token: selected.accessToken,
  tenantId: tenant.id,
});
assert.equal(currentTenant.id, tenant.id);

const settings = await request('/settings', {
  token: selected.accessToken,
  tenantId: tenant.id,
});
assert.equal(settings.version, 1);

const updatedSettings = await request('/settings', {
  method: 'PATCH',
  token: selected.accessToken,
  tenantId: tenant.id,
  body: {
    expectedVersion: settings.version,
    branding: { appName: 'Verified Control Plane', primaryColor: '#0F766E' },
    localization: { timezone: 'Asia/Kolkata', defaultCurrency: 'INR' },
    features: { advancedAudit: true },
  },
});
assert.equal(updatedSettings.version, 2);
assert.equal(updatedSettings.branding.appName, 'Verified Control Plane');

await request('/settings', {
  method: 'PATCH',
  token: selected.accessToken,
  tenantId: tenant.id,
  body: { expectedVersion: 1, features: { staleWrite: true } },
  expectedStatus: 409,
});

const auditLogs = await request('/audit?limit=20', {
  token: selected.accessToken,
  tenantId: tenant.id,
});
const actions = new Set(auditLogs.map((entry) => entry.action));
assert.ok(actions.has('PROVISION'));
assert.ok(actions.has('SETTINGS_CHANGE'));
assert.ok(actions.has('STATUS_CHANGE'));

const refreshed = await request('/auth/refresh', {
  method: 'POST',
  body: { refreshToken: selected.refreshToken },
});
assert.notEqual(refreshed.refreshToken, selected.refreshToken);

await request('/auth/refresh', {
  method: 'POST',
  body: { refreshToken: selected.refreshToken },
  expectedStatus: 401,
});

const modules = await request('/modules', { token: refreshed.accessToken });
assert.equal(modules.length, 4);
assert.ok(modules.every((module) => module.status === 'READY'));

await request('/auth/logout', {
  method: 'POST',
  token: refreshed.accessToken,
  expectedStatus: 204,
});
await request('/auth/refresh', {
  method: 'POST',
  body: { refreshToken: refreshed.refreshToken },
  expectedStatus: 401,
});

console.log(JSON.stringify({
  status: 'passed',
  tenantId: tenant.id,
  tenantSlug: tenant.slug,
  verified: [
    'readiness',
    'validation',
    'registration',
    'session-persistence',
    'tenant-provisioning',
    'membership-rbac',
    'settings-optimistic-concurrency',
    'tenant-status-lifecycle',
    'audit-trail',
    'refresh-token-rotation',
    'module-registry',
    'logout-revocation',
  ],
}, null, 2));
