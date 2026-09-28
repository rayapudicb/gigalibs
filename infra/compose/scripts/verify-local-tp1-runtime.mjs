#!/usr/bin/env node
// WI-OI-046 / TP-1 Runtime Certification Harness
// Executes real exact-image certification against local control plane and database.
// Tests sections A through L of Section 8. Attributable non-production fixtures.

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
const METRICS_TOKEN = process.env.OBSERVABILITY_METRICS_TOKEN || '';
const CONFIGURATION_PATH = '/api/v1/configuration';
const AUTH_PATH = '/api/v1/auth';
const METRICS_PATH = '/api/v1/internal/metrics';
const outcomes = [];
const failures = [];
const timings = {};
const cleanup = { tokens: [], userIds: [], tenantIds: [], customRoleIds: [] };
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
      json = raw;
    }
  }
  return { status: response.status, json, headers: response.headers };
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

function assertSafeError(response, context) {
  const bodyText = typeof response.json === 'object' ? JSON.stringify(response.json) : String(response.json ?? '');
  const forbiddenPatterns = [
    /at\s+[\w$./\\-]+\s+\(/i,
    /at\s+async\s+/i,
    /PrismaClient/i,
    /prisma\./i,
    /SELECT\s+.+\s+FROM/i,
    /INSERT\s+INTO/i,
    /\/Users\//i,
    /\/home\//i,
    /\/app\/dist\//i,
    /passwordHash/i,
    /JWT_SECRET/i,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !pattern.test(bodyText),
      `Safe error violation in ${context}: response matched forbidden pattern ${pattern} -> ${bodyText.slice(0, 100)}`,
    );
  }
}

async function timedCurrentRead(token) {
  const started = performance.now();
  try {
    const result = await api(
      `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
      { token },
    );
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
      results[index] = await timedCurrentRead(token);
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
let readerOnly;
let primaryTenant;
let outsiderTenant;
let authorToken;
let reviewerToken;
let outsiderToken;
let readerToken;

try {
  const suffix = `tp1-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const password = `Cert!${randomBytes(20).toString('base64url')}`;
  const passwordHash = await hashPassword(password);

  // Setup test identities
  [author, reviewer, outsider, readerOnly] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `cert-author-${suffix}@gigalibs-certification.invalid`,
        name: `TP-1 Author ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-reviewer-${suffix}@gigalibs-certification.invalid`,
        name: `TP-1 Reviewer ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-outsider-${suffix}@gigalibs-certification.invalid`,
        name: `TP-1 Outsider ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-reader-${suffix}@gigalibs-certification.invalid`,
        name: `TP-1 Reader ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);
  cleanup.userIds.push(author.id, reviewer.id, outsider.id, readerOnly.id);

  // Setup 2 distinct tenants
  primaryTenant = await prisma.tenant.create({
    data: {
      slug: `cert-tp1-primary-${suffix}`.slice(0, 63),
      name: `TP-1 Primary ${suffix}`,
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { certification: 'WI-OI-046' },
          updatedById: author.id,
        },
      },
    },
  });
  outsiderTenant = await prisma.tenant.create({
    data: {
      slug: `cert-tp1-outsider-${suffix}`.slice(0, 63),
      name: `TP-1 Outsider ${suffix}`,
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { certification: 'WI-OI-046' },
          updatedById: outsider.id,
        },
      },
    },
  });
  cleanup.tenantIds.push(primaryTenant.id, outsiderTenant.id);

  // Create custom role with only configuration-runtime:read for readerOnly
  const runtimeReaderRole = await prisma.customRole.create({
    data: {
      tenantId: primaryTenant.id,
      name: `RuntimeReader-${suffix}`.slice(0, 40),
      description: 'Role with only configuration-runtime:read',
      permissions: ['configuration-runtime:read'],
      isSystem: false,
    },
  });
  cleanup.customRoleIds.push(runtimeReaderRole.id);

  await prisma.tenantMember.createMany({
    data: [
      { tenantId: primaryTenant.id, userId: author.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
      { tenantId: primaryTenant.id, userId: reviewer.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
      { tenantId: primaryTenant.id, userId: readerOnly.id, role: 'MEMBER', customRoleId: runtimeReaderRole.id, permissions: ['configuration-runtime:read'], status: 'ACTIVE' },
      { tenantId: outsiderTenant.id, userId: outsider.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
    ],
  });

  // Create active tenant-access entitlement for primaryTenant
  await prisma.tenantModuleEntitlement.create({
    data: {
      tenantId: primaryTenant.id,
      moduleKey: 'tenant-access',
      status: 'ENABLED',
      source: 'PLAN',
      startsAt: new Date(Date.now() - 60000),
      reason: 'WI-OI-046 TP-1 certification entitlement',
      updatedById: author.id,
    },
  });

  [authorToken, reviewerToken, outsiderToken, readerToken] = await Promise.all([
    tenantToken(author.email, password, primaryTenant.id),
    tenantToken(reviewer.email, password, primaryTenant.id),
    tenantToken(outsider.email, password, outsiderTenant.id),
    tenantToken(readerOnly.email, password, primaryTenant.id),
  ]);
  assert.notEqual(primaryTenant.id, outsiderTenant.id);
  outcomes.push('test-identities-and-tenants-created');

  // Publish and activate Tenant Profile configuration
  const profileDefinition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title: `TP-1 Profile ${suffix}`,
    fields: [
      {
        key: 'custom-notes',
        label: 'Custom Notes',
        type: 'TEXT',
        component: 'text-input',
        required: false,
        readOnly: false,
        classification: 'INTERNAL',
      },
    ],
    sections: [
      {
        key: 'section-1',
        title: 'General',
        columns: 1,
        fieldKeys: ['custom-notes'],
      },
    ],
  };
  const draftResponse = await api(`${CONFIGURATION_PATH}/change-sets`, {
    method: 'POST',
    token: authorToken,
    body: {
      definition: profileDefinition,
      reason: 'TP-1 Profile extension change-set',
      idempotencyKey: `cert-profile-draft-${suffix}`,
    },
  });
  assert.equal(draftResponse.status, 201, `Create profile draft: ${draftResponse.status}`);
  const draft = draftResponse.json;
  const submittedResponse = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/submit`, {
    method: 'POST',
    token: authorToken,
    body: { reason: 'Submit TP-1 profile change-set', expectedVersion: draft.version },
  });
  assert.equal(submittedResponse.status, 200, `Submit profile change-set: ${submittedResponse.status}`);
  const approvedResponse = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/approve`, {
    method: 'POST',
    token: reviewerToken,
    body: { reason: 'Independent TP-1 profile approval', expectedVersion: submittedResponse.json.version },
  });
  assert.equal(approvedResponse.status, 200, `Approve profile change-set: ${approvedResponse.status}`);
  const publishedResponse = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/publish`, {
    method: 'POST',
    token: reviewerToken,
    body: { reason: 'Publish TP-1 profile', expectedVersion: approvedResponse.json.version },
  });
  assert.equal(publishedResponse.status, 200, `Publish profile change-set: ${publishedResponse.status}`);
  const published = publishedResponse.json;
  const activationResponse = await api(`${CONFIGURATION_PATH}/activations`, {
    method: 'POST',
    token: reviewerToken,
    body: {
      publishedVersionId: published.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Activate TP-1 profile',
      idempotencyKey: `cert-profile-activate-${suffix}`,
    },
  });
  assert.equal(activationResponse.status, 201, `Activate profile: ${activationResponse.status}`);
  outcomes.push('profile-change-set-published-and-activated');

  // =========================================================================
  // SECTION A: Strict Current Runtime
  // =========================================================================
  const currentRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(currentRes.status, 200, `Current runtime must return 200, got ${currentRes.status}`);
  assert.ok(currentRes.json, 'Current runtime response must be an object');
  assert.equal(currentRes.json.scope.environmentKey, 'local-uat', 'Scope environmentKey must be local-uat');
  assert.equal(currentRes.json.scope.cohortKey, 'all-users', 'Scope cohortKey must be all-users');
  assert.equal(currentRes.json.adapter.adapterKey, 'tenant-profile-v1', 'Adapter key must match');
  assert.ok(typeof currentRes.json.checksum === 'string', 'Checksum must be a string');
  assert.ok(Array.isArray(currentRes.json.manifest.fields), 'Manifest fields must be an array');
  outcomes.push('A1-strict-current-runtime-succeeds-without-client-scope');

  // Unknown query parameter returns 400
  const unknownParamRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&unknownField=value`,
    { token: authorToken },
  );
  assert.equal(unknownParamRes.status, 400, `Unknown query field must return 400, got ${unknownParamRes.status}`);
  assertSafeError(unknownParamRes, 'current-runtime-unknown-field');
  outcomes.push('A2-current-runtime-unknown-query-field-returns-400');

  // Unknown adapter returns 404
  const unknownAdapterRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=unknown-module&entityKey=unknown-entity&surfaceKey=unknown-surface`,
    { token: authorToken },
  );
  assert.equal(unknownAdapterRes.status, 404, `Unknown adapter must return 404, got ${unknownAdapterRes.status}`);
  assertSafeError(unknownAdapterRes, 'current-runtime-unknown-adapter');
  outcomes.push('A3-current-runtime-unknown-adapter-not-found');

  // =========================================================================
  // SECTION B: Legacy Compatibility
  // =========================================================================
  const legacyNoScopeRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(legacyNoScopeRes.status, 200, `Legacy without scope must return 200, got ${legacyNoScopeRes.status}`);
  assert.ok(legacyNoScopeRes.json.checksum, 'Legacy manifest must have checksum');
  assert.equal(legacyNoScopeRes.json.scope, undefined, 'Legacy manifest must not have top-level scope object');
  outcomes.push('B1-legacy-runtime-without-assertions-succeeds');

  const legacyMatchingRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users`,
    { token: authorToken },
  );
  assert.equal(legacyMatchingRes.status, 200, `Legacy with matching assertions must return 200, got ${legacyMatchingRes.status}`);
  outcomes.push('B2-legacy-runtime-matching-assertions-succeeds');

  const legacyMismatchedEnvRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=wrong-env&cohortKey=all-users`,
    { token: authorToken },
  );
  assert.equal(legacyMismatchedEnvRes.status, 403, `Mismatched environment must return 403, got ${legacyMismatchedEnvRes.status}`);
  assertSafeError(legacyMismatchedEnvRes, 'legacy-mismatched-env');
  outcomes.push('B3-legacy-runtime-mismatched-env-rejected-403');

  const legacyMismatchedCohortRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=wrong-cohort`,
    { token: authorToken },
  );
  assert.equal(legacyMismatchedCohortRes.status, 403, `Mismatched cohort must return 403, got ${legacyMismatchedCohortRes.status}`);
  assertSafeError(legacyMismatchedCohortRes, 'legacy-mismatched-cohort');
  outcomes.push('B4-legacy-runtime-mismatched-cohort-rejected-403');

  // =========================================================================
  // SECTION C: Entitlements
  // =========================================================================
  // Update to DISABLED
  await prisma.tenantModuleEntitlement.update({
    where: { tenantId_moduleKey: { tenantId: primaryTenant.id, moduleKey: 'tenant-access' } },
    data: { status: 'DISABLED' },
  });
  const disabledRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(disabledRes.status, 403, `Disabled entitlement must return 403, got ${disabledRes.status}`);
  assertSafeError(disabledRes, 'disabled-entitlement');
  outcomes.push('C1-disabled-entitlement-denied');

  // Update to future startsAt
  await prisma.tenantModuleEntitlement.update({
    where: { tenantId_moduleKey: { tenantId: primaryTenant.id, moduleKey: 'tenant-access' } },
    data: { status: 'ENABLED', startsAt: new Date(Date.now() + 86400000) },
  });
  const futureRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(futureRes.status, 403, `Future entitlement must return 403, got ${futureRes.status}`);
  assertSafeError(futureRes, 'future-entitlement');
  outcomes.push('C2-future-entitlement-denied');

  // Update to expired endsAt
  await prisma.tenantModuleEntitlement.update({
    where: { tenantId_moduleKey: { tenantId: primaryTenant.id, moduleKey: 'tenant-access' } },
    data: { status: 'ENABLED', startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() - 60000) },
  });
  const expiredRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(expiredRes.status, 403, `Expired entitlement must return 403, got ${expiredRes.status}`);
  assertSafeError(expiredRes, 'expired-entitlement');
  outcomes.push('C3-expired-entitlement-denied');

  // Re-enable entitlement without restart
  await prisma.tenantModuleEntitlement.update({
    where: { tenantId_moduleKey: { tenantId: primaryTenant.id, moduleKey: 'tenant-access' } },
    data: { status: 'ENABLED', startsAt: new Date(Date.now() - 60000), endsAt: null },
  });
  const restoredEntitlementRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(restoredEntitlementRes.status, 200, `Restored entitlement must succeed, got ${restoredEntitlementRes.status}`);
  outcomes.push('C4-entitlement-restoration-effective-without-service-restart');

  // =========================================================================
  // SECTION D: Preview Authorization & Audit
  // =========================================================================
  // Dual permissions: TENANT_ADMIN has both configuration-runtime:read and configuration:read
  const previewPath = `${CONFIGURATION_PATH}/runtime/manifest/preview?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users`;
  const previewRes = await api(previewPath, { token: authorToken });
  assert.equal(previewRes.status, 200, `Authorized preview must return 200, got ${previewRes.status}`);
  outcomes.push('D1-dual-permission-preview-authorized');

  // Check audit log recorded for preview
  const previewAudit = await prisma.auditLog.findFirst({
    where: {
      tenantId: primaryTenant.id,
      userId: author.id,
      resource: 'configuration-runtime-preview',
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(previewAudit, 'Audit log entry must exist for preview runtime');
  assert.equal(previewAudit.action, 'EXPORT');
  outcomes.push('D2-preview-generates-sanitized-audit-log');

  // readerOnly has only configuration-runtime:read, NOT configuration:read
  const previewDeniedReaderRes = await api(previewPath, { token: readerToken });
  assert.equal(previewDeniedReaderRes.status, 403, `Single-permission user must be denied preview (403), got ${previewDeniedReaderRes.status}`);
  assertSafeError(previewDeniedReaderRes, 'preview-single-permission-denied');
  outcomes.push('D3-single-permission-denied-preview');

  // Unauthenticated preview returns 401
  const unauthPreviewRes = await api(previewPath);
  assert.equal(unauthPreviewRes.status, 401, `Unauthenticated preview must return 401, got ${unauthPreviewRes.status}`);
  outcomes.push('D4-unauthenticated-preview-returns-401');

  // =========================================================================
  // SECTION E: Two-Tenant Isolation
  // =========================================================================
  // Outsider tenant has NO entitlement -> denied
  const outsiderCurrentRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: outsiderToken },
  );
  assert.equal(outsiderCurrentRes.status, 403, `Outsider without entitlement must be denied (403), got ${outsiderCurrentRes.status}`);

  // Create entitlement for outsiderTenant
  await prisma.tenantModuleEntitlement.create({
    data: {
      tenantId: outsiderTenant.id,
      moduleKey: 'tenant-access',
      status: 'ENABLED',
      source: 'PLAN',
      startsAt: new Date(Date.now() - 60000),
      reason: 'Outsider tenant entitlement',
      updatedById: outsider.id,
    },
  });

  const outsiderEnabledRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: outsiderToken },
  );
  assert.equal(outsiderEnabledRes.status, 404, `Outsider without published activation must return 404, got ${outsiderEnabledRes.status}`);

  // Cross-tenant access: outsider trying to access primary tenant's extension values
  const crossTenantValuesRes = await api(
    `${CONFIGURATION_PATH}/extension-values/tenant-profile/${primaryTenant.id}`,
    { token: outsiderToken },
  );
  assert.ok([400, 403, 404].includes(crossTenantValuesRes.status), `Cross-tenant read must return 400, 403 or 404, got ${crossTenantValuesRes.status}`);
  assertSafeError(crossTenantValuesRes, 'cross-tenant-read');
  outcomes.push('E1-two-tenant-manifest-and-data-isolation');

  // =========================================================================
  // SECTION F: Revocation
  // =========================================================================
  const authorMembership = { userId_tenantId: { userId: author.id, tenantId: primaryTenant.id } };

  // Downgrade author to VIEWER
  await prisma.tenantMember.update({ where: authorMembership, data: { role: 'VIEWER' } });
  const downgradedCurrent = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(downgradedCurrent.status, 200, 'Viewer can read runtime manifest');

  // Suspend author membership -> 403
  await prisma.tenantMember.update({ where: authorMembership, data: { status: 'SUSPENDED' } });
  const suspendedMemberRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(suspendedMemberRes.status, 403, `Suspended member must return 403, got ${suspendedMemberRes.status}`);

  // Restore membership, suspend user -> 401
  await prisma.tenantMember.update({ where: authorMembership, data: { role: 'TENANT_ADMIN', status: 'ACTIVE' } });
  await prisma.user.update({ where: { id: author.id }, data: { status: 'SUSPENDED' } });
  const suspendedUserRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(suspendedUserRes.status, 401, `Suspended user must return 401, got ${suspendedUserRes.status}`);

  // Restore user, suspend tenant -> 403
  await prisma.user.update({ where: { id: author.id }, data: { status: 'ACTIVE' } });
  await prisma.tenant.update({ where: { id: primaryTenant.id }, data: { status: 'SUSPENDED' } });
  const suspendedTenantRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(suspendedTenantRes.status, 403, `Suspended tenant must return 403, got ${suspendedTenantRes.status}`);

  // Restore tenant
  await prisma.tenant.update({ where: { id: primaryTenant.id }, data: { status: 'ACTIVE' } });
  const activeTenantRes = await api(
    `${CONFIGURATION_PATH}/runtime/manifest/current?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension`,
    { token: authorToken },
  );
  assert.equal(activeTenantRes.status, 200, `Active tenant must return 200, got ${activeTenantRes.status}`);
  outcomes.push('F1-live-membership-user-and-tenant-revocation-without-restart');

  // =========================================================================
  // SECTION G: Configuration Value Lifecycle
  // =========================================================================
  const getValuesRes = await api(
    `${CONFIGURATION_PATH}/extension-values/tenant-profile/${primaryTenant.id}`,
    { token: authorToken },
  );
  assert.equal(getValuesRes.status, 200, `Get extension values must return 200, got ${getValuesRes.status}`);
  const initialVersion = getValuesRes.json?.version ?? 0;

  const saveValuesRes = await api(
    `${CONFIGURATION_PATH}/extension-values/tenant-profile/${primaryTenant.id}`,
    {
      method: 'POST',
      token: authorToken,
      body: {
        publishedVersionId: published.id,
        expectedVersion: initialVersion,
        values: { 'custom-notes': 'Validated TP-1 note value' },
        reason: 'TP-1 certification extension value save',
        idempotencyKey: `cert-save-val-${suffix}`,
      },
    },
  );
  assert.equal(saveValuesRes.status, 200, `Save extension values must return 200, got ${saveValuesRes.status}`);
  outcomes.push('G1-extension-values-saved-and-persisted');

  // Optimistic concurrency conflict test: save with stale expectedVersion
  const conflictRes = await api(
    `${CONFIGURATION_PATH}/extension-values/tenant-profile/${primaryTenant.id}`,
    {
      method: 'POST',
      token: authorToken,
      body: {
        publishedVersionId: published.id,
        expectedVersion: initialVersion, // Stale version
        values: { 'custom-notes': 'Conflict value' },
        reason: 'TP-1 conflict test',
        idempotencyKey: `cert-conflict-${suffix}`,
      },
    },
  );
  assert.equal(conflictRes.status, 409, `Stale expectedVersion must return 409 Conflict, got ${conflictRes.status}`);
  assertSafeError(conflictRes, 'optimistic-concurrency-conflict');
  outcomes.push('G2-optimistic-concurrency-rejects-stale-write-409');

  // =========================================================================
  // SECTION I: Safe Errors
  // =========================================================================
  const notFoundRes = await api(`${CONFIGURATION_PATH}/non-existent-route-404`, { token: authorToken });
  assert.equal(notFoundRes.status, 404);
  assertSafeError(notFoundRes, 'not-found-404');
  outcomes.push('I1-safe-errors-verified-across-failure-codes');

  // =========================================================================
  // SECTION J: Observability
  // =========================================================================
  if (METRICS_TOKEN) {
    const metricsRes = await fetch(`${API_URL}${METRICS_PATH}`, {
      headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
    });
    assert.equal(metricsRes.status, 200, `Metrics scrape must return 200, got ${metricsRes.status}`);
    const metricsText = await metricsRes.text();
    assert.ok(
      metricsText.includes('gigalibs_configuration_runtime_requests_total') ||
        metricsText.includes('gigalibs_http_requests_total'),
      'Metrics must contain runtime metrics',
    );
    // Verify no tenant IDs or tokens leaked in metric labels
    assert.ok(!metricsText.includes(primaryTenant.id), 'Metrics must not contain tenant ID');
    assert.ok(!metricsText.includes(author.id), 'Metrics must not contain user ID');
    outcomes.push('J1-observability-metrics-scraped-and-labels-bounded');
  } else {
    outcomes.push('J1-observability-metrics-skipped-no-token');
  }

  // =========================================================================
  // SECTION K: Local Performance Characterization (100 reads, concurrency 10)
  // =========================================================================
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
  outcomes.push('K1-100-reads-at-concurrency-10-within-latency-thresholds');

} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push(message);
  process.stderr.write(`FAIL: ${message}\n${error instanceof Error ? (error.stack ?? '') : ''}\n`);
} finally {
  // =========================================================================
  // SECTION L: Cleanup Accounting
  // =========================================================================
  for (const token of cleanup.tokens) {
    await api(`${AUTH_PATH}/logout`, { method: 'POST', token }).catch(() => undefined);
  }
  if (cleanup.tenantIds.length > 0 || cleanup.userIds.length > 0) {
    await prisma
      .$transaction([
        prisma.tenantModuleEntitlement.deleteMany({
          where: { tenantId: { in: cleanup.tenantIds } },
        }),
        prisma.customRole.deleteMany({
          where: { id: { in: cleanup.customRoleIds } },
        }),
        prisma.configurationExtensionValue.deleteMany({
          where: { tenantId: { in: cleanup.tenantIds } },
        }),
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

    const [activeUsers, activeTenants, activeMemberships, activeEntitlements] = await Promise.all([
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
      prisma.tenantModuleEntitlement.count({
        where: { tenantId: { in: cleanup.tenantIds }, status: 'ENABLED' },
      }),
    ]).catch((error) => {
      failures.push(`cleanup-verification-failed: ${error.message}`);
      return [-1, -1, -1, -1];
    });

    Object.assign(cleanupCounts, { activeUsers, activeTenants, activeMemberships, activeEntitlements });
    if (activeUsers !== 0 || activeTenants !== 0 || activeMemberships !== 0 || activeEntitlements !== 0) {
      failures.push(
        `cleanup-left-active-records: users=${activeUsers} tenants=${activeTenants} memberships=${activeMemberships} entitlements=${activeEntitlements}`,
      );
    } else {
      outcomes.push('L1-generated-test-identities-tenants-memberships-and-entitlements-cleaned');
    }
  }

  await prisma.$disconnect().catch(() => undefined);
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  writeFileSync(
    process.env.EVIDENCE_PATH,
    JSON.stringify(
      {
        verifier: 'verify-local-tp1-runtime',
        timestamp: START_TS,
        status,
        profile: process.env.PROFILE_KEY || 'UNKNOWN',
        releaseId: process.env.RELEASE_ID || 'UNKNOWN',
        sourceRevision: process.env.SOURCE_REVISION || 'UNKNOWN',
        sourceStateSha256: process.env.SOURCE_STATE_SHA256 || 'UNKNOWN',
        apiUrl: API_URL,
        images: IMAGES,
        outcomes,
        failures,
        timings,
        testDataCleanup: cleanupCounts,
        limitations: [
          'TP-2 through TP-6 capabilities (durable export jobs, transactional outbox/inbox, connection governance) are outside TP-1',
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
  } else {
    console.log(`PASS: ${outcomes.length} outcomes verified`);
  }
}
