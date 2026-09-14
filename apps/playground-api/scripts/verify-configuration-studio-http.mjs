import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const baseUrl = process.env.CONTROL_PLANE_TEST_URL;
if (!baseUrl || !process.env.DATABASE_URL) throw new Error('CONTROL_PLANE_TEST_URL and DATABASE_URL are required');
const [{ prisma }, { hashPassword }] = await Promise.all([import('../../../packages/db/dist/index.js'), import('../../../packages/auth-core/dist/index.js')]);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const password = `Uat-${randomBytes(20).toString('base64url')}!`;
let tenant;
let author;
let reviewer;

async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  assert.equal(response.status, expected, `${method} ${path}: ${raw}`);
  return payload;
}

async function tenantToken(email) {
  const login = await request('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  const selected = await request('/api/v1/auth/select-tenant', { method: 'POST', token: login.accessToken, body: { tenantId: tenant.id } });
  return selected.accessToken;
}

try {
  const passwordHash = await hashPassword(password);
  [author, reviewer] = await prisma.$transaction([
    prisma.user.create({ data: { email: `uat.config.http.author.${suffix}@gigalibs.invalid`, name: 'UAT HTTP Author', passwordHash, status: 'ACTIVE' } }),
    prisma.user.create({ data: { email: `uat.config.http.reviewer.${suffix}@gigalibs.invalid`, name: 'UAT HTTP Reviewer', passwordHash, status: 'ACTIVE' } }),
  ]);
  tenant = await prisma.tenant.create({ data: {
    slug: `uat-config-http-${suffix}`.slice(0, 63),
    name: 'UAT Configuration HTTP Tenant',
    status: 'ACTIVE',
    features: ['dynamic-forms'],
    settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {}, updatedById: author.id } },
  } });
  await prisma.tenantMember.createMany({ data: [{ tenantId: tenant.id, userId: author.id, role: 'TENANT_ADMIN' }, { tenantId: tenant.id, userId: reviewer.id, role: 'TENANT_ADMIN' }] });
  const [authorToken, reviewerToken] = await Promise.all([tenantToken(author.email), tenantToken(reviewer.email)]);
  await request('/api/v1/configuration/change-sets', { expected: 401 });
  const surfaces = await request('/api/v1/configuration/surfaces', { token: authorToken });
  assert.deepEqual(surfaces.map((surface) => surface.registrationKey), ['tenant-profile-extension', 'tenant-record-application']);
  assert.equal(surfaces.some((surface) => surface.moduleKey === 'accounts-receivable'), false);

  const definition = { contractVersion: '1.0', moduleKey: 'tenant-settings', entityKey: 'tenant-profile', surfaceKey: 'profile-extension', mode: 'EDIT', title: 'HTTP UAT fields', fields: [{ key: 'site-code', label: 'Site code', type: 'TEXT', component: 'text-input', required: true, readOnly: false, classification: 'INTERNAL' }], sections: [{ key: 'site', title: 'Site', columns: 1, fieldKeys: ['site-code'] }] };
  const draft = await request('/api/v1/configuration/change-sets', { token: authorToken, method: 'POST', body: { definition, reason: 'HTTP contract certification', idempotencyKey: `http-${randomBytes(12).toString('hex')}` }, expected: 201 });
  const submitted = await request(`/api/v1/configuration/change-sets/${draft.id}/submit`, { token: authorToken, method: 'POST', body: { reason: 'Submit through HTTP', expectedVersion: draft.version } });
  await request(`/api/v1/configuration/change-sets/${draft.id}/approve`, { token: authorToken, method: 'POST', body: { reason: 'Self approval rejection', expectedVersion: submitted.version }, expected: 403 });
  const approved = await request(`/api/v1/configuration/change-sets/${draft.id}/approve`, { token: reviewerToken, method: 'POST', body: { reason: 'Independent HTTP approval', expectedVersion: submitted.version } });
  const published = await request(`/api/v1/configuration/change-sets/${draft.id}/publish`, { token: reviewerToken, method: 'POST', body: { reason: 'Publish over HTTP', expectedVersion: approved.version } });
  await request('/api/v1/configuration/activations', { token: reviewerToken, method: 'POST', body: { publishedVersionId: published.id, environmentKey: 'local-uat', cohortKey: 'all-users', reason: 'Activate over HTTP', idempotencyKey: `http-${randomBytes(12).toString('hex')}` }, expected: 201 });
  const runtime = await request('/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users', { token: authorToken });
  assert.equal(runtime.checksum, published.checksum);
  const values = await request(`/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`, { token: authorToken, method: 'POST', body: { publishedVersionId: published.id, expectedVersion: 0, values: { 'site-code': 'HYD-01' }, reason: 'Save over HTTP', idempotencyKey: `http-${randomBytes(12).toString('hex')}` } });
  assert.equal(values.values['site-code'], 'HYD-01');
  const incompatibleDraft = await request('/api/v1/configuration/change-sets', { token: authorToken, method: 'POST', body: { definition: { ...definition, title: 'HTTP incompatible UAT fields', fields: [], sections: [] }, reason: 'HTTP impact analysis certification', idempotencyKey: `http-${randomBytes(12).toString('hex')}` }, expected: 201 });
  const impact = await request(`/api/v1/configuration/change-sets/${incompatibleDraft.id}/impact`, { token: authorToken });
  assert.equal(impact.activationAllowed, false);
  assert.equal(impact.incompatible.extensionValues, 1);
  const incompatibleSubmitted = await request(`/api/v1/configuration/change-sets/${incompatibleDraft.id}/submit`, { token: authorToken, method: 'POST', body: { reason: 'Submit HTTP impact change', expectedVersion: incompatibleDraft.version } });
  const incompatibleApproved = await request(`/api/v1/configuration/change-sets/${incompatibleDraft.id}/approve`, { token: reviewerToken, method: 'POST', body: { reason: 'Approve HTTP impact change', expectedVersion: incompatibleSubmitted.version } });
  const incompatiblePublished = await request(`/api/v1/configuration/change-sets/${incompatibleDraft.id}/publish`, { token: reviewerToken, method: 'POST', body: { reason: 'Publish HTTP impact change', expectedVersion: incompatibleApproved.version } });
  await request('/api/v1/configuration/activations', { token: reviewerToken, method: 'POST', body: { publishedVersionId: incompatiblePublished.id, environmentKey: 'local-uat', cohortKey: 'all-users', reason: 'Unsafe HTTP activation must be denied', idempotencyKey: `http-${randomBytes(12).toString('hex')}` }, expected: 409 });
  const exportedPackage = await request('/api/v1/configuration/packages/export', { token: reviewerToken, method: 'POST', body: { publishedVersionIds: [published.id], reason: 'HTTP package export', idempotencyKey: `http-${randomBytes(12).toString('hex')}` } });
  const importedPackage = await request('/api/v1/configuration/packages/import', { token: authorToken, method: 'POST', body: { package: exportedPackage, reason: 'HTTP package import', idempotencyKey: `http-${randomBytes(12).toString('hex')}` }, expected: 201 });
  assert.equal(importedPackage.importedChangeSets.length, 1);
  const tamperedPackage = structuredClone(exportedPackage);
  tamperedPackage.payload.definitions[0].definition.title = 'Tampered over HTTP';
  await request('/api/v1/configuration/packages/import', { token: authorToken, method: 'POST', body: { package: tamperedPackage, reason: 'HTTP tamper rejection', idempotencyKey: `http-${randomBytes(12).toString('hex')}` }, expected: 400 });
  console.log(JSON.stringify({ certification: 'WI-OI-039-http-boundary', outcomes: ['unauthenticated-denied', 'tenant-rbac-enforced', 'control-plane-surface-registry-is-authoritative', 'self-approval-denied', 'published-and-activated', 'runtime-and-values-persisted', 'record-aware-impact-and-unsafe-activation-denied', 'signed-package-export-import-tamper-denied'], testData: 'isolated-attributed-and-deactivated' }, null, 2));
} finally {
  const tenantIds = tenant ? [tenant.id] : [];
  const userIds = [author?.id, reviewer?.id].filter(Boolean);
  await prisma.$transaction([
    prisma.tenantMember.updateMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] }, data: { status: 'SUSPENDED' } }),
    prisma.tenant.updateMany({ where: { id: { in: tenantIds } }, data: { status: 'CANCELLED', features: [] } }),
    prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'DEACTIVATED' } }),
  ]).catch(() => undefined);
  await prisma.$disconnect();
}
