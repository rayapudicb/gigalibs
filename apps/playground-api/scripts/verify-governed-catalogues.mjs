// WI-OI-064c live certification: platform-shipped catalogues go through Configuration Studio's governed
// lifecycle (install → submit → independent approval → publish → activate → runtime read) with real logins.
// Creates run-scoped `wi-oi-064c-*` tenants and `@gigalibs.invalid` users; revokes their sessions afterwards.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const baseUrl = process.env.CONTROL_PLANE_TEST_URL;
if (!baseUrl) throw new Error('CONTROL_PLANE_TEST_URL is required');
const environmentKey = process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY ?? 'local-uat';
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const run = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const userIds = [];

async function request(path, { token, expected, ...init } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (expected !== undefined) assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function tenant(label, modules) {
  const created = await prisma.tenant.create({
    data: {
      slug: `wi-oi-064c-${label}-${run}`.slice(0, 63),
      name: `WI-OI-064c ${label}`,
      status: 'ACTIVE',
      region: 'local',
      features: modules,
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
  return created;
}

async function admin(tenantId, label) {
  const password = `Cat-${randomBytes(18).toString('base64url')}!`;
  const email = `wi-oi-064c.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({ data: { email, name: `Catalogue ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  await prisma.tenantMember.create({ data: { userId: user.id, tenantId, role: 'TENANT_ADMIN', status: 'ACTIVE' } });
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), expected: 200 });
  return { id: user.id, token: login.body.accessToken };
}

async function entitle(tenantId, modules, byUserId) {
  for (const moduleKey of modules) {
    await prisma.tenantModuleEntitlement.create({
      data: { tenantId, moduleKey, status: 'ENABLED', source: 'PLATFORM_OVERRIDE', reason: 'WI-OI-064c certification', updatedById: byUserId },
    });
  }
}

/** install → submit → approve (second admin) → publish → activate; returns the published version. */
async function govern(author, approver, kind, surfaceKey) {
  const installed = await request('/configuration/catalogues/install', {
    token: author.token, method: 'POST', expected: 201,
    body: JSON.stringify({ kind, surfaceKey, reason: `Install ${kind} ${surfaceKey}`, idempotencyKey: `install-${kind}-${surfaceKey}-${run}` }),
  });
  assert.equal(installed.body.status, 'VALIDATED', `${kind}/${surfaceKey} compiles on install`);
  const id = installed.body.id;
  const step = (action, who, version, expected = 200) =>
    request(`/configuration/change-sets/${id}/${action}`, {
      token: who.token, method: 'POST', expected, body: JSON.stringify({ reason: `${action} ${kind}`, expectedVersion: version }),
    });
  const submitted = await step('submit', author, installed.body.version);
  await step('approve', author, submitted.body.version, 403);
  const approved = await step('approve', approver, submitted.body.version);
  const published = await step('publish', author, approved.body.version);
  await request('/configuration/activations', {
    token: author.token, method: 'POST', expected: 201,
    body: JSON.stringify({ publishedVersionId: published.body.id, environmentKey, cohortKey: 'all-users', reason: `Activate ${kind}`, idempotencyKey: `activate-${kind}-${surfaceKey}-${run}` }),
  });
  return published.body;
}

try {
  const entitled = await tenant('entitled', ['analytics-studio', 'gigaops']);
  const author = await admin(entitled.id, 'author');
  const approver = await admin(entitled.id, 'approver');
  await entitle(entitled.id, ['analytics-studio', 'gigaops'], author.id);

  const listed = (await request('/configuration/catalogues', { token: author.token, expected: 200 })).body.items;
  assert.equal(listed.filter((item) => item.kind === 'INDUSTRY_PACK').length, 9);
  assert.ok(listed.some((item) => item.kind === 'COUNTRY_PACK' && item.surfaceKey === 'jp' && item.activation === null));

  const metrics = await govern(author, approver, 'METRIC_CATALOGUE', 'operations');
  const current = (await request('/configuration/catalogues/current?kind=METRIC_CATALOGUE&surfaceKey=operations', { token: author.token, expected: 200 })).body;
  assert.equal(current.checksum, metrics.checksum, 'runtime serves the activated checksum');
  assert.deepEqual(current.manifest.catalogue.metrics.map((metric) => metric.key).slice(0, 3), ['labour_hours', 'labour_cost', 'spend']);

  await govern(author, approver, 'COUNTRY_PACK', 'jp');
  const japan = (await request('/configuration/catalogues/current?kind=COUNTRY_PACK&surfaceKey=jp', { token: approver.token, expected: 200 })).body;
  assert.equal(japan.manifest.catalogue.subdivisions.length, 47);
  assert.equal(japan.manifest.catalogue.currency, 'JPY');

  // Removing a published metric is classified as breaking before anyone approves it.
  const reduced = structuredClone(current.manifest);
  delete reduced.compilerVersion;
  delete reduced.checksum;
  reduced.catalogue.metrics = reduced.catalogue.metrics.filter((metric) => metric.key !== 'carbon_per_labour_hour');
  const breaking = await request('/configuration/change-sets', {
    token: author.token, method: 'POST', expected: 201,
    body: JSON.stringify({ definition: reduced, reason: 'Retire a ratio', idempotencyKey: `reduce-${run}` }),
  });
  assert.equal(breaking.body.compatibility, 'BREAKING');

  // A ratio over an unknown metric is rejected by the contract before persistence.
  const invalid = structuredClone(reduced);
  invalid.catalogue.metrics.push({ kind: 'RATIO', key: 'bad', label: 'Bad', unit: 'RATIO', numerator: 'nope', denominator: 'labour_hours' });
  await request('/configuration/change-sets', { token: author.token, method: 'POST', expected: 400, body: JSON.stringify({ definition: invalid, reason: 'Invalid ratio', idempotencyKey: `invalid-${run}` }) });

  await request('/configuration/catalogues/install', {
    token: author.token, method: 'POST', expected: 404,
    body: JSON.stringify({ kind: 'INDUSTRY_PACK', surfaceKey: 'shipbuilding', reason: 'Unknown pack', idempotencyKey: `unknown-${run}` }),
  });

  // A tenant without the GigaOps entitlement cannot install an industry pack.
  const unentitled = await tenant('unentitled', ['analytics-studio']);
  const outsider = await admin(unentitled.id, 'outsider');
  const denied = await request('/configuration/catalogues/install', {
    token: outsider.token, method: 'POST',
    body: JSON.stringify({ kind: 'INDUSTRY_PACK', surfaceKey: 'qsr', reason: 'No entitlement', idempotencyKey: `denied-${run}` }),
  });
  assert.equal(denied.status, 403, `unentitled install: ${JSON.stringify(denied.body)}`);

  // Each governed catalogue: change set created, submitted, approved, version published, activated; plus the
  // breaking draft. Denied, invalid and unknown requests leave no records.
  const trail = await prisma.auditLog.groupBy({
    by: ['resource', 'action'],
    where: { tenantId: entitled.id, resource: { startsWith: 'configuration-' } },
    _count: true,
  });
  const counts = Object.fromEntries(trail.map((row) => [`${row.resource}:${row.action}`, row._count]));
  assert.deepEqual(counts, {
    'configuration-activation:STATUS_CHANGE': 2,
    'configuration-change-set:CREATE': 3,
    'configuration-change-set:STATUS_CHANGE': 4,
    'configuration-version:CREATE': 2,
  });
  const audits = trail.reduce((total, row) => total + row._count, 0);

  console.log(`WI-OI-064c governed catalogue verification passed for run ${run}: bundled list, metric catalogue and Japan pack installed, independently approved, published, activated and served at runtime (checksum match, 47 prefectures), breaking removal classified, invalid ratio 400, unknown pack 404, unentitled tenant 403, ${audits} audit records.`);
} finally {
  if (userIds.length) {
    await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
  await prisma.$disconnect();
}
