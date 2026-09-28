#!/usr/bin/env node
// Phase A4 — F2 runtime certification against the real local control plane.
// Generated records are attributable, isolated to two tenants and made inactive on exit.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

if (process.env.NODE_ENV === 'production') throw new Error('NODE_ENV=production is not permitted');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
if (!API_URL || !URL.canParse(API_URL)) throw new Error('API_URL must be a loopback base URL');
const parsedApiUrl = new URL(API_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(parsedApiUrl.hostname)) {
  throw new Error(`API_URL must be loopback — got ${parsedApiUrl.hostname}`);
}
if (!process.env.EVIDENCE_PATH) throw new Error('EVIDENCE_PATH must be set');
if (!process.env.DATABASE_URL || !URL.canParse(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL is required for attributable test-data setup and cleanup');
}
const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.hostname === 'host.docker.internal') databaseUrl.hostname = '127.0.0.1';
if (!['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
  throw new Error(`DATABASE_URL must be loopback — got ${databaseUrl.hostname}`);
}
process.env.DATABASE_URL = databaseUrl.toString();

const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const IMAGES = {
  migrations: process.env.MIGRATIONS_IMAGE || 'UNKNOWN',
  api: process.env.API_IMAGE || 'UNKNOWN',
  web: process.env.WEB_IMAGE || 'UNKNOWN',
};
const CONFIGURATION_PATH = '/api/v1/configuration';
const AUTH_PATH = '/api/v1/auth';
const outcomes = [];
const failures = [];
const timings = {};
const cleanup = { tokens: [], userIds: [], tenantIds: [] };
const cleanupCounts = {};
const START_TS = new Date().toISOString();

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let json = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json };
}

async function tenantToken(email, password, tenantId) {
  const login = await api(`${AUTH_PATH}/login`, { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200, `Login failed for generated identity: ${login.status}`);
  cleanup.tokens.push(login.json.accessToken);
  const selected = await api(`${AUTH_PATH}/select-tenant`, {
    method: 'POST',
    token: login.json.accessToken,
    body: { tenantId },
  });
  assert.equal(selected.status, 200, `Tenant selection failed: ${selected.status}`);
  cleanup.tokens.push(selected.json.accessToken);
  return selected.json.accessToken;
}

async function timedSurfaceRead(token) {
  const started = performance.now();
  try {
    const result = await api(`${CONFIGURATION_PATH}/surfaces`, { token });
    return { ok: result.status === 200, latencyMs: performance.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function boundedReads(token, count, concurrency) {
  const results = new Array(count);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < count) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await timedSurfaceRead(token);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function percentile(sorted, value) {
  return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] ?? Number.POSITIVE_INFINITY;
}

let author;
let reviewer;
let outsider;
let primaryTenant;
let outsiderTenant;

try {
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const password = `Cert!${randomBytes(20).toString('base64url')}`;
  const passwordHash = await hashPassword(password);
  [author, reviewer, outsider] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `cert-author-${suffix}@gigalibs-certification.invalid`,
        name: `F2 Author ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-reviewer-${suffix}@gigalibs-certification.invalid`,
        name: `F2 Reviewer ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-outsider-${suffix}@gigalibs-certification.invalid`,
        name: `F2 Outsider ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);
  cleanup.userIds.push(author.id, reviewer.id, outsider.id);

  primaryTenant = await prisma.tenant.create({
    data: {
      slug: `cert-f2-primary-${suffix}`.slice(0, 63),
      name: `F2 Primary ${suffix}`,
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { certification: 'WI-OI-047' },
          updatedById: author.id,
        },
      },
    },
  });
  outsiderTenant = await prisma.tenant.create({
    data: {
      slug: `cert-f2-outsider-${suffix}`.slice(0, 63),
      name: `F2 Outsider ${suffix}`,
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { certification: 'WI-OI-047' },
          updatedById: outsider.id,
        },
      },
    },
  });
  cleanup.tenantIds.push(primaryTenant.id, outsiderTenant.id);
  await prisma.tenantMember.createMany({
    data: [
      { tenantId: primaryTenant.id, userId: author.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
      { tenantId: primaryTenant.id, userId: reviewer.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
      { tenantId: outsiderTenant.id, userId: outsider.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
    ],
  });
  const [authorToken, reviewerToken, outsiderToken] = await Promise.all([
    tenantToken(author.email, password, primaryTenant.id),
    tenantToken(reviewer.email, password, primaryTenant.id),
    tenantToken(outsider.email, password, outsiderTenant.id),
  ]);
  assert.notEqual(primaryTenant.id, outsiderTenant.id);
  outcomes.push('two-distinct-tenants-and-maker-checker-identities');

  const surfacesResponse = await api(`${CONFIGURATION_PATH}/surfaces`, { token: authorToken });
  assert.equal(surfacesResponse.status, 200, `Surface list: ${surfacesResponse.status}`);
  assert.ok(Array.isArray(surfacesResponse.json), 'Surface list must be an array');
  assert.deepEqual(
    surfacesResponse.json.map((surface) => surface.registrationKey),
    [
      'tenant-profile-extension',
      'tenant-record-application',
      'ar-customer-record',
      'ar-invoice-draft',
    ],
  );
  outcomes.push('four-surface-discovery');
  const unauthenticated = await api(`${CONFIGURATION_PATH}/surfaces`);
  assert.equal(unauthenticated.status, 401, `Unauthenticated surfaces: ${unauthenticated.status}`);
  outcomes.push('unauthenticated-returns-401');

  const entityKey = `cert-form-${suffix}`.slice(0, 70);
  const definition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-apps',
    entityKey,
    surfaceKey: 'custom-form',
    mode: 'CREATE',
    title: `F2 Certification ${suffix}`,
    fields: [],
    sections: [],
  };
  const draftResponse = await api(`${CONFIGURATION_PATH}/change-sets`, {
    method: 'POST',
    token: authorToken,
    body: {
      definition,
      reason: 'F2 maker checker certification',
      idempotencyKey: `cert-draft-${suffix}`,
    },
  });
  assert.equal(draftResponse.status, 201, `Create change set: ${draftResponse.status}`);
  const draft = draftResponse.json;
  assert.equal(draft.status, 'VALIDATED');
  const submittedResponse = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/submit`, {
    method: 'POST',
    token: authorToken,
    body: { reason: 'Submit F2 certification', expectedVersion: draft.version },
  });
  assert.equal(submittedResponse.status, 200, `Submit: ${submittedResponse.status}`);
  const selfApproval = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/approve`, {
    method: 'POST',
    token: authorToken,
    body: {
      reason: 'Self approval must be rejected',
      expectedVersion: submittedResponse.json.version,
    },
  });
  assert.equal(selfApproval.status, 403, `Self approval must be 403, got ${selfApproval.status}`);
  outcomes.push('maker-checker-self-approval-denied');
  const approvedResponse = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/approve`, {
    method: 'POST',
    token: reviewerToken,
    body: { reason: 'Independent F2 approval', expectedVersion: submittedResponse.json.version },
  });
  assert.equal(approvedResponse.status, 200, `Approve: ${approvedResponse.status}`);
  const publishedResponse = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/publish`, {
    method: 'POST',
    token: reviewerToken,
    body: { reason: 'Publish F2 certification', expectedVersion: approvedResponse.json.version },
  });
  assert.equal(publishedResponse.status, 200, `Publish: ${publishedResponse.status}`);
  const published = publishedResponse.json;
  const activationResponse = await api(`${CONFIGURATION_PATH}/activations`, {
    method: 'POST',
    token: reviewerToken,
    body: {
      publishedVersionId: published.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Activate F2 certification',
      idempotencyKey: `cert-activate-${suffix}`,
    },
  });
  assert.equal(activationResponse.status, 201, `Activate: ${activationResponse.status}`);
  const runtimePath = `${CONFIGURATION_PATH}/runtime/manifest?moduleKey=tenant-apps&entityKey=${encodeURIComponent(entityKey)}&surfaceKey=custom-form&environmentKey=local-uat&cohortKey=all-users`;
  const manifestResponse = await api(runtimePath, { token: authorToken });
  assert.equal(manifestResponse.status, 200, `Runtime manifest: ${manifestResponse.status}`);
  assert.equal(manifestResponse.json.checksum, published.checksum);
  outcomes.push('maker-checker-publish-activate-and-checksum-persistence');

  const outsiderList = await api(`${CONFIGURATION_PATH}/change-sets`, { token: outsiderToken });
  assert.equal(outsiderList.status, 200, `Outsider list: ${outsiderList.status}`);
  assert.ok(!outsiderList.json.some((changeSet) => changeSet.id === draft.id));
  const outsiderApproval = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/approve`, {
    method: 'POST',
    token: outsiderToken,
    body: { reason: 'Cross tenant denial', expectedVersion: submittedResponse.json.version },
  });
  assert.ok(
    [403, 404].includes(outsiderApproval.status),
    `Cross-tenant mutation returned ${outsiderApproval.status}`,
  );
  const outsiderManifest = await api(runtimePath, { token: outsiderToken });
  assert.ok(
    [403, 404].includes(outsiderManifest.status),
    `Cross-tenant manifest returned ${outsiderManifest.status}`,
  );
  outcomes.push('cross-tenant-list-mutation-and-runtime-isolation');

  const tenantProfileValues = await api(
    `${CONFIGURATION_PATH}/extension-values/tenant-profile/${primaryTenant.id}`,
    { token: authorToken },
  );
  assert.equal(tenantProfileValues.status, 200);
  assert.equal(tenantProfileValues.json, null, 'F2 must not create Tenant Profile values');
  outcomes.push('tenant-profile-values-remain-unwritten');

  const fields = [];
  const sectionFieldKeys = [[], [], []];
  for (let index = 1; index <= 250; index += 1) {
    const key = `field-${String(index).padStart(3, '0')}`;
    fields.push({
      key,
      label: `Field ${index}`,
      type: 'TEXT',
      component: 'text-input',
      required: index <= 20,
      readOnly: false,
      classification: 'INTERNAL',
      maxLength: 50,
    });
    sectionFieldKeys[index <= 84 ? 0 : index <= 167 ? 1 : 2].push(key);
  }
  const largeDefinition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-apps',
    entityKey: `cert-250-${suffix}`.slice(0, 70),
    surfaceKey: 'custom-form',
    mode: 'CREATE',
    title: `F2 250 Field ${suffix}`,
    fields,
    sections: sectionFieldKeys.map((fieldKeys, index) => ({
      key: `section-${index + 1}`,
      title: `Section ${index + 1}`,
      columns: 2,
      fieldKeys,
    })),
  };
  const largeDraftResponse = await api(`${CONFIGURATION_PATH}/change-sets`, {
    method: 'POST',
    token: authorToken,
    body: {
      definition: largeDefinition,
      reason: 'F2 250-field supported-surface certification',
      idempotencyKey: `cert-250-${suffix}`,
    },
  });
  assert.equal(
    largeDraftResponse.status,
    201,
    `250-field change set: ${largeDraftResponse.status}`,
  );
  assert.equal(largeDraftResponse.json.definition.fields.length, 250);
  assert.equal(
    largeDraftResponse.json.definition.fields.filter((field) => field.required).length,
    20,
  );
  assert.equal(largeDraftResponse.json.definition.sections.length, 3);
  outcomes.push('250-field-tenant-app-custom-form-accepted');
  const oversizedProfileResponse = await api(`${CONFIGURATION_PATH}/change-sets`, {
    method: 'POST',
    token: authorToken,
    body: {
      definition: {
        ...largeDefinition,
        moduleKey: 'tenant-settings',
        entityKey: 'tenant-profile',
        surfaceKey: 'profile-extension',
        mode: 'EDIT',
        fields: fields.slice(0, 101),
        sections: [
          {
            key: 'profile-section',
            title: 'Profile section',
            columns: 1,
            fieldKeys: fields.slice(0, 100).map((field) => field.key),
          },
          {
            key: 'profile-section-overflow',
            title: 'Profile section overflow',
            columns: 1,
            fieldKeys: [fields[100].key],
          },
        ],
      },
      reason: 'F2 profile-extension upper-bound certification',
      idempotencyKey: `cert-profile-limit-${suffix}`,
    },
  });
  assert.ok(
    [400, 422].includes(oversizedProfileResponse.status),
    `101-field profile extension returned ${oversizedProfileResponse.status}`,
  );
  outcomes.push('profile-extension-101-field-rejected');

  const readResults = await boundedReads(authorToken, 100, 10);
  const latencies = readResults
    .map((result) => result.latencyMs)
    .sort((left, right) => left - right);
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);
  const maximum = latencies.at(-1) ?? Number.POSITIVE_INFINITY;
  const failedReads = readResults.filter((result) => !result.ok).length;
  timings.concurrentReads = {
    count: 100,
    concurrency: 10,
    p50Ms: Number(p50.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    p99Ms: Number(p99.toFixed(3)),
    maxMs: Number(maximum.toFixed(3)),
    failedCount: failedReads,
  };
  assert.equal(failedReads, 0, `${failedReads}/100 bounded reads failed`);
  assert.ok(p95 <= 500, `Concurrent-read p95 ${p95.toFixed(3)}ms exceeds 500ms`);
  assert.ok(p99 <= 1000, `Concurrent-read p99 ${p99.toFixed(3)}ms exceeds 1000ms`);
  outcomes.push('100-surface-reads-at-concurrency-10-within-threshold');

  const authorMembership = { userId_tenantId: { userId: author.id, tenantId: primaryTenant.id } };
  await prisma.tenantMember.update({ where: authorMembership, data: { role: 'VIEWER' } });
  assert.equal((await api(`${CONFIGURATION_PATH}/surfaces`, { token: authorToken })).status, 403);
  assert.equal((await api(runtimePath, { token: authorToken })).status, 200);
  await prisma.tenantMember.update({
    where: authorMembership,
    data: { role: 'TENANT_ADMIN', status: 'SUSPENDED' },
  });
  assert.equal((await api(runtimePath, { token: authorToken })).status, 403);
  await prisma.tenantMember.update({ where: authorMembership, data: { status: 'ACTIVE' } });
  await prisma.user.update({ where: { id: author.id }, data: { status: 'SUSPENDED' } });
  assert.equal((await api(runtimePath, { token: authorToken })).status, 401);
  await prisma.user.update({ where: { id: author.id }, data: { status: 'ACTIVE' } });
  await prisma.tenant.update({ where: { id: primaryTenant.id }, data: { status: 'SUSPENDED' } });
  assert.equal((await api(runtimePath, { token: authorToken })).status, 403);
  await prisma.tenant.update({ where: { id: primaryTenant.id }, data: { status: 'ACTIVE' } });
  outcomes.push('live-role-membership-user-and-tenant-revocation');

  const logoutResponse = await api(`${AUTH_PATH}/logout`, { method: 'POST', token: authorToken });
  assert.equal(logoutResponse.status, 204, `Logout: ${logoutResponse.status}`);
  assert.equal((await api(`${CONFIGURATION_PATH}/surfaces`, { token: authorToken })).status, 401);
  outcomes.push('logout-session-revocation');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push(message);
  process.stderr.write(`FAIL: ${message}\n${error instanceof Error ? (error.stack ?? '') : ''}\n`);
} finally {
  for (const token of cleanup.tokens)
    await api(`${AUTH_PATH}/logout`, { method: 'POST', token }).catch(() => undefined);
  if (cleanup.tenantIds.length > 0 || cleanup.userIds.length > 0) {
    await prisma
      .$transaction([
        prisma.tenantMember.updateMany({
          where: {
            OR: [{ tenantId: { in: cleanup.tenantIds } }, { userId: { in: cleanup.userIds } }],
          },
          data: { status: 'SUSPENDED' },
        }),
        prisma.tenant.updateMany({
          where: { id: { in: cleanup.tenantIds } },
          data: { status: 'CANCELLED', features: [] },
        }),
        prisma.user.updateMany({
          where: { id: { in: cleanup.userIds } },
          data: { status: 'DEACTIVATED' },
        }),
      ])
      .catch((error) => failures.push(`cleanup-update-failed: ${error.message}`));
    const [activeUsers, activeTenants, activeMemberships] = await Promise.all([
      prisma.user.count({ where: { id: { in: cleanup.userIds }, status: 'ACTIVE' } }),
      prisma.tenant.count({
        where: { id: { in: cleanup.tenantIds }, status: { not: 'CANCELLED' } },
      }),
      prisma.tenantMember.count({
        where: {
          OR: [{ tenantId: { in: cleanup.tenantIds } }, { userId: { in: cleanup.userIds } }],
          status: 'ACTIVE',
        },
      }),
    ]).catch((error) => {
      failures.push(`cleanup-verification-failed: ${error.message}`);
      return [-1, -1, -1];
    });
    Object.assign(cleanupCounts, { activeUsers, activeTenants, activeMemberships });
    if (activeUsers !== 0 || activeTenants !== 0 || activeMemberships !== 0)
      failures.push(
        `cleanup-left-active-records: users=${activeUsers} tenants=${activeTenants} memberships=${activeMemberships}`,
      );
    else outcomes.push('generated-test-identities-tenants-and-memberships-inactive');
  }
  await prisma.$disconnect().catch(() => undefined);
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  writeFileSync(
    process.env.EVIDENCE_PATH,
    JSON.stringify(
      {
        verifier: 'verify-local-f2-runtime',
        timestamp: START_TS,
        status,
        profile: process.env.PROFILE_KEY || 'UNKNOWN',
        releaseId: process.env.RELEASE_ID || 'UNKNOWN',
        apiUrl: API_URL,
        images: IMAGES,
        outcomes,
        failures,
        timings,
        testDataCleanup: cleanupCounts,
        limitations: [
          'F3/TP-1 Tenant Profile value persistence is outside F2 and was not exercised',
          'TLS/DNS and public origin are deferred to an authorized release profile',
          'Manual keyboard, screen-reader, zoom and high-contrast review requires a human',
          'External vulnerability tooling requires separately available scanner authorization',
        ],
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) {
    process.stderr.write(`FAIL (${failures.length}):\n${failures.join('\n')}\n`);
    process.exitCode = 1;
  } else console.log(`PASS: ${outcomes.length} outcomes verified`);
}
