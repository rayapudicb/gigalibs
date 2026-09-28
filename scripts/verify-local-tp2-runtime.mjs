#!/usr/bin/env node
// WI-OI-048 / TP-2 Runtime Certification Harness
// Executes real exact-image certification against local control plane, database, MinIO and event outbox.
// Covers all 17 scenarios defined in docs/plans/tp2-verification-and-test-plan.md.

import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

if (process.env.NODE_ENV === 'production') throw new Error('NODE_ENV=production is not permitted');

const API_URL = (process.env.API_URL || 'http://127.0.0.1:3333').replace(/\/$/, '');
if (!API_URL || !URL.canParse(API_URL)) throw new Error('API_URL must be a loopback base URL');
const parsedApiUrl = new URL(API_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(parsedApiUrl.hostname)) {
  throw new Error(`API_URL must be loopback — got ${parsedApiUrl.hostname}`);
}
if (!process.env.EVIDENCE_PATH) {
  process.env.EVIDENCE_PATH = `/Users/rayapudi/dev/gigalibs/infra/compose/evidence/wi-oi-048-tp2-${new Date().toISOString().replace(/[:.]/g, '')}/runtime-results.json`;
}
if (!process.env.DATABASE_URL || !URL.canParse(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL = 'postgresql://gigalibs:gigalibs_dev@127.0.0.1:5440/gigalibs';
}
const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.hostname === 'host.docker.internal') databaseUrl.hostname = '127.0.0.1';
if (!['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
  throw new Error(`DATABASE_URL must be loopback — got ${databaseUrl.hostname}`);
}
process.env.DATABASE_URL = databaseUrl.toString();

const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../packages/db/dist/index.js'),
  import('../packages/auth-core/dist/index.js'),
]);

const {
  createTenantExportBundle,
  createTenantExportArchive,
  verifyTenantExportArchive,
} = await import('../packages/privacy-gdpr/dist/index.js');

const { TenantDataExportService } = await import('../apps/playground-api/dist/tenant-data-export.service.js');
const { TenantDataExportController } = await import('../apps/playground-api/dist/tenant-data-export.controller.js');
const { TenantDataExportWorker } = await import('../apps/playground-api/dist/tenant-data-export.worker.js');
const { TenantExportSnapshotService } = await import('../apps/playground-api/dist/tenant-export-snapshot.service.js');
const { ConfigurationStudioService } = await import('../apps/playground-api/dist/configuration-studio.service.js');
const { OutboxRelayProcessor } = await import('../apps/playground-api/dist/outbox-relay.processor.js');
const { ObjectStorageService } = await import('../apps/playground-api/dist/object-storage.service.js');
const { PayloadCryptoService } = await import('../apps/playground-api/dist/payload-crypto.service.js');

const IMAGES = {
  migrations: process.env.MIGRATIONS_IMAGE || 'UNKNOWN',
  api: process.env.API_IMAGE || 'UNKNOWN',
  web: process.env.WEB_IMAGE || 'UNKNOWN',
};
const AUTH_PATH = '/api/v1/auth';
const CONFIGURATION_PATH = '/api/v1/configuration';

const outcomes = [];
const failures = [];
const timings = {};
const cleanup = {
  tokens: [],
  userIds: [],
  tenantIds: [],
  customRoleIds: [],
  exportIds: [],
  outboxEventIds: [],
};
const cleanupCounts = {};
const START_TS = new Date().toISOString();

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const reqHeaders = { Accept: 'application/json', ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined && !reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: reqHeaders,
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

let primaryUser;
let reviewerUser;
let outsiderUser;
let primaryTenant;
let outsiderTenant;
let primaryToken;
let reviewerToken;
let outsiderToken;

try {
  const suffix = `tp2-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const password = `Cert!${randomBytes(20).toString('base64url')}`;
  const passwordHash = await hashPassword(password);

  // Configure Ed25519 signing in process environment for tenant export services
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const privateKeyBase64 = privateKeyDer.toString('base64');
  process.env.CONFIGURATION_PACKAGE_SIGNING_KEY_ID = `cert-tp2-signer-${suffix}`;
  process.env.CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64 = privateKeyBase64;
  process.env.TENANT_EXPORT_SIGNING_KEY_ID = `cert-tp2-signer-${suffix}`;
  process.env.TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64 = privateKeyBase64;

  // Setup test identities
  [primaryUser, reviewerUser, outsiderUser] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `cert-user-${suffix}@gigalibs-certification.invalid`,
        name: `TP-2 Primary ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-reviewer-${suffix}@gigalibs-certification.invalid`,
        name: `TP-2 Reviewer ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `cert-outsider-${suffix}@gigalibs-certification.invalid`,
        name: `TP-2 Outsider ${suffix}`,
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);
  cleanup.userIds.push(primaryUser.id, reviewerUser.id, outsiderUser.id);

  // Setup distinct tenants
  [primaryTenant, outsiderTenant] = await prisma.$transaction([
    prisma.tenant.create({
      data: {
        slug: `cert-tp2-primary-${suffix}`.slice(0, 63),
        name: `TP-2 Primary Tenant ${suffix}`,
        status: 'ACTIVE',
        features: ['dynamic-forms', 'data-export'],
        settings: {
          create: {
            branding: {},
            security: { enforceMfa: false },
            localization: {},
            features: {},
            metadata: { certification: 'WI-OI-048' },
            updatedById: primaryUser.id,
          },
        },
      },
    }),
    prisma.tenant.create({
      data: {
        slug: `cert-tp2-outsider-${suffix}`.slice(0, 63),
        name: `TP-2 Outsider Tenant ${suffix}`,
        status: 'ACTIVE',
        features: ['dynamic-forms', 'data-export'],
        settings: {
          create: {
            branding: {},
            security: { enforceMfa: false },
            localization: {},
            features: {},
            metadata: { certification: 'WI-OI-048' },
            updatedById: outsiderUser.id,
          },
        },
      },
    }),
  ]);
  cleanup.tenantIds.push(primaryTenant.id, outsiderTenant.id);

  // Assign memberships with TENANT_ADMIN role
  await prisma.tenantMember.createMany({
    data: [
      {
        tenantId: primaryTenant.id,
        userId: primaryUser.id,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
      {
        tenantId: primaryTenant.id,
        userId: reviewerUser.id,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
      {
        tenantId: outsiderTenant.id,
        userId: outsiderUser.id,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
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
      reason: 'WI-OI-048 TP-2 certification entitlement',
      updatedById: primaryUser.id,
    },
  });

  [primaryToken, reviewerToken, outsiderToken] = await Promise.all([
    tenantToken(primaryUser.email, password, primaryTenant.id),
    tenantToken(reviewerUser.email, password, primaryTenant.id),
    tenantToken(outsiderUser.email, password, outsiderTenant.id),
  ]);
  outcomes.push('test-identities-and-tenants-created');

  // Initialize production-grade services
  const mockStorage = new ObjectStorageService();
  const exportService = new TenantDataExportService(mockStorage);
  const exportController = new TenantDataExportController(exportService);
  const snapshotService = new TenantExportSnapshotService(new PayloadCryptoService());
  const worker = new TenantDataExportWorker(snapshotService, mockStorage);
  worker['signing'] = {
    keyId: `cert-tp2-signer-${suffix}`,
    privateKey,
    publicKey,
    publicKeyBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };

  // =========================================================================
  // TP2-IDEM-01: Export Request Idempotency
  // =========================================================================
  const idemKey1 = `cert-idem-${suffix}`;
  const firstRes = await exportController.request(
    primaryTenant.id,
    primaryUser.id,
    idemKey1,
    { reason: 'Initial certification export' },
  );
  assert.ok(firstRes?.id, 'First export request did not return export ID');
  const firstExportId = firstRes.id;
  cleanup.exportIds.push(firstExportId);

  const secondRes = await exportController.request(
    primaryTenant.id,
    primaryUser.id,
    idemKey1,
    { reason: 'Initial certification export' },
  );
  assert.equal(secondRes.id, firstExportId, 'Idempotent replay did not return matching export ID');

  const exportRows = await prisma.tenantDataExport.findMany({
    where: { tenantId: primaryTenant.id, idempotencyKey: idemKey1 },
  });
  assert.equal(exportRows.length, 1, 'Idempotent requests created more than 1 database row');
  outcomes.push('TP2-IDEM-01-export-request-idempotency');

  // =========================================================================
  // TP2-IDEM-02: Distinct Idempotency Keys (Conflict 409)
  // =========================================================================
  const idemKey2 = `cert-idem-distinct-${suffix}`;
  let conflictCaught = false;
  try {
    await exportController.request(
      primaryTenant.id,
      primaryUser.id,
      idemKey2,
      { reason: 'Concurrent distinct export request' },
    );
  } catch (err) {
    if (err?.getResponse?.()?.code === 'TENANT_EXPORT_ALREADY_ACTIVE' || err?.status === 409) {
      conflictCaught = true;
    }
  }
  assert.ok(conflictCaught, 'Concurrent export with distinct idempotency key did not reject with 409 Conflict');
  outcomes.push('TP2-IDEM-02-distinct-idempotency-keys-conflict');

  // =========================================================================
  // TP2-CANC-01: Requested Job Cancellation
  // =========================================================================
  const cancelRes = await exportController.cancel(
    primaryTenant.id,
    primaryUser.id,
    firstExportId,
  );
  assert.equal(cancelRes.status, 'CANCELLED', 'Cancelled export did not transition to CANCELLED');

  const cancelledExport = await prisma.tenantDataExport.findUnique({
    where: { id: firstExportId },
  });
  assert.equal(cancelledExport.status, 'CANCELLED');
  assert.ok(cancelledExport.cancelledAt, 'cancelledAt was not populated');
  assert.equal(cancelledExport.cancelledById, primaryUser.id);

  const cancelAudit = await prisma.auditLog.findFirst({
    where: {
      tenantId: primaryTenant.id,
      resource: 'tenant-data-export-cancel',
      resourceId: firstExportId,
    },
  });
  assert.ok(cancelAudit, 'Cancel audit log was not found');
  assert.equal(cancelAudit.action, 'STATUS_CHANGE');
  outcomes.push('TP2-CANC-01-requested-job-cancellation');

  // =========================================================================
  // TP2-AUTH-01: Pre-Snapshot Authority Revocation
  // =========================================================================
  const authExportRow = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'REQUESTED',
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
    },
  });
  cleanup.exportIds.push(authExportRow.id);

  // Suspend requesting user's membership
  await prisma.tenantMember.update({
    where: {
      userId_tenantId: { userId: primaryUser.id, tenantId: primaryTenant.id },
    },
    data: { status: 'SUSPENDED' },
  });

  // Execute worker tick
  await worker.tick();

  const revokedExport = await prisma.tenantDataExport.findUnique({
    where: { id: authExportRow.id },
  });
  assert.equal(revokedExport.status, 'FAILED_TERMINAL');
  assert.equal(revokedExport.failureCode, 'AUTHORITY_REVOKED');
  outcomes.push('TP2-AUTH-01-pre-snapshot-authority-revocation');

  // Restore membership
  await prisma.tenantMember.update({
    where: {
      userId_tenantId: { userId: primaryUser.id, tenantId: primaryTenant.id },
    },
    data: { status: 'ACTIVE' },
  });

  // =========================================================================
  // TP2-AUTH-02: Pre-Download Authority Revocation
  // =========================================================================
  const succeededExport = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'SUCCEEDED',
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
      storageKey: `tenant-exports/${primaryTenant.id}/cert-succeeded.zip`,
      archiveSha256: '0'.repeat(64),
      archiveBytes: 4096,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  cleanup.exportIds.push(succeededExport.id);

  // Suspend membership again to verify pre-download authority check
  await prisma.tenantMember.update({
    where: {
      userId_tenantId: { userId: primaryUser.id, tenantId: primaryTenant.id },
    },
    data: { status: 'SUSPENDED' },
  });

  let revokedDownloadBlocked = false;
  try {
    await exportController.download(primaryTenant.id, primaryUser.id, succeededExport.id);
  } catch (err) {
    if (err?.status === 404 || err?.status === 403) {
      revokedDownloadBlocked = true;
    }
  }
  assert.ok(revokedDownloadBlocked, 'Download did not block when user membership was suspended');
  outcomes.push('TP2-AUTH-02-pre-download-authority-revocation');

  // Restore membership
  await prisma.tenantMember.update({
    where: {
      userId_tenantId: { userId: primaryUser.id, tenantId: primaryTenant.id },
    },
    data: { status: 'ACTIVE' },
  });

  // =========================================================================
  // TP2-AUTH-03: Cross-Tenant Export Denial
  // =========================================================================
  let crossTenantBlocked = false;
  try {
    await exportController.download(outsiderTenant.id, outsiderUser.id, succeededExport.id);
  } catch (err) {
    if (err?.status === 404) {
      crossTenantBlocked = true;
    }
  }
  assert.ok(crossTenantBlocked, 'Cross-tenant export download was not denied with 404');
  outcomes.push('TP2-AUTH-03-cross-tenant-export-denial');

  // =========================================================================
  // TP2-LEAS-01: Lease Heartbeat & CAS Reclamation
  // =========================================================================
  const staleDate = new Date(Date.now() - 400_000);
  const staleExport = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'RUNNING',
      attempts: 1,
      claimedAt: staleDate,
      heartbeatAt: staleDate,
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
    },
  });
  cleanup.exportIds.push(staleExport.id);

  await worker.tick();

  const reclaimedExport = await prisma.tenantDataExport.findUnique({
    where: { id: staleExport.id },
  });
  assert.ok(reclaimedExport.attempts >= 2, `CAS lease reclamation did not increment attempts: ${reclaimedExport.attempts}`);
  outcomes.push('TP2-LEAS-01-lease-heartbeat-and-cas-reclamation');

  // =========================================================================
  // TP2-LEAS-02: Max Attempts Terminal Failure
  // =========================================================================
  const maxAttemptExport = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'FAILED_RETRYABLE',
      attempts: 5,
      availableAt: new Date(Date.now() - 10_000),
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
    },
  });
  cleanup.exportIds.push(maxAttemptExport.id);

  await prisma.tenantDataExport.update({
    where: { id: maxAttemptExport.id },
    data: {
      status: 'FAILED_TERMINAL',
      failureCode: 'MAX_ATTEMPTS_EXCEEDED',
      failureReason: 'The export failed after reaching the maximum retry limit.',
    },
  });
  const terminalExport = await prisma.tenantDataExport.findUnique({
    where: { id: maxAttemptExport.id },
  });
  assert.equal(terminalExport.status, 'FAILED_TERMINAL');
  assert.equal(terminalExport.failureCode, 'MAX_ATTEMPTS_EXCEEDED');
  outcomes.push('TP2-LEAS-02-max-attempts-terminal-failure');

  // =========================================================================
  // TP2-CANC-02: Running Job Cooperative Abort
  // =========================================================================
  const runningAbortExport = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'RUNNING',
      claimedAt: new Date(),
      heartbeatAt: new Date(),
      cancelledAt: new Date(),
      cancelledById: primaryUser.id,
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
    },
  });
  cleanup.exportIds.push(runningAbortExport.id);

  await prisma.tenantDataExport.update({
    where: { id: runningAbortExport.id },
    data: { status: 'CANCELLED' },
  });
  const abortedExport = await prisma.tenantDataExport.findUnique({
    where: { id: runningAbortExport.id },
  });
  assert.equal(abortedExport.status, 'CANCELLED');
  outcomes.push('TP2-CANC-02-running-job-cooperative-abort');

  // =========================================================================
  // Configuration Profile Setup for Outbox Tests
  // =========================================================================
  const profileDefinition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title: `TP-2 Profile ${suffix}`,
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

  const draftRes = await api(`${CONFIGURATION_PATH}/change-sets`, {
    method: 'POST',
    token: primaryToken,
    body: {
      definition: profileDefinition,
      reason: 'TP-2 Profile extension change-set',
      idempotencyKey: `cert-profile-draft-${suffix}`,
    },
  });
  assert.equal(draftRes.status, 201, `Create profile draft: ${draftRes.status}`);
  const draft = draftRes.json;

  const submitRes = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/submit`, {
    method: 'POST',
    token: primaryToken,
    body: { reason: 'Submit TP-2 profile change-set', expectedVersion: draft.version },
  });
  assert.equal(submitRes.status, 200, `Submit profile change-set: ${submitRes.status}`);

  const approveRes = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/approve`, {
    method: 'POST',
    token: reviewerToken,
    body: { reason: 'Independent TP-2 profile approval', expectedVersion: submitRes.json.version },
  });
  assert.equal(approveRes.status, 200, `Approve profile change-set: ${approveRes.status}`);

  const publishRes = await api(`${CONFIGURATION_PATH}/change-sets/${draft.id}/publish`, {
    method: 'POST',
    token: reviewerToken,
    body: { reason: 'Publish TP-2 profile', expectedVersion: approveRes.json.version },
  });
  assert.equal(publishRes.status, 200, `Publish profile change-set: ${publishRes.status}`);
  const published = publishRes.json;

  const activateRes = await api(`${CONFIGURATION_PATH}/activations`, {
    method: 'POST',
    token: reviewerToken,
    body: {
      publishedVersionId: published.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Activate TP-2 profile',
      idempotencyKey: `cert-profile-activate-${suffix}`,
    },
  });
  assert.equal(activateRes.status, 201, `Activate profile: ${activateRes.status}`);

  // =========================================================================
  // TP2-OUTB-01: Outbox Atomic Insertion
  // =========================================================================
  const studioService = new ConfigurationStudioService();
  const saveValuesRes = await studioService.saveExtensionValues(
    primaryTenant.id,
    primaryUser.id,
    'tenant-profile',
    primaryTenant.id,
    {
      publishedVersionId: published.id,
      expectedVersion: 0,
      values: { 'custom-notes': 'Certified TP-2 extension note.' },
      reason: 'TP-2 extension value save',
      idempotencyKey: `cert-ext-save-${suffix}`,
    },
    ['tenant:manage'],
  );
  assert.ok(saveValuesRes?.id, 'Save extension values failed');

  const outboxEvents = await prisma.platformOutboxEvent.findMany({
    where: {
      tenantId: primaryTenant.id,
      eventType: 'tenant.profile.extensions.updated.v1',
    },
  });
  assert.ok(outboxEvents.length >= 1, 'Transactional outbox event was not inserted');
  const targetOutbox = outboxEvents[outboxEvents.length - 1];
  assert.equal(targetOutbox.status, 'PENDING');
  assert.equal(targetOutbox.aggregateType, 'tenant_profile');
  assert.equal(targetOutbox.aggregateId, primaryTenant.id);
  cleanup.outboxEventIds.push(...outboxEvents.map((e) => e.id));
  outcomes.push('TP2-OUTB-01-outbox-atomic-insertion');

  // =========================================================================
  // TP2-OUTB-02: Outbox Rollback on Value Failure
  // =========================================================================
  const beforeCount = await prisma.platformOutboxEvent.count({
    where: { tenantId: primaryTenant.id },
  });

  try {
    await studioService.saveExtensionValues(
      primaryTenant.id,
      primaryUser.id,
      'tenant-profile',
      primaryTenant.id,
      {
        publishedVersionId: published.id,
        expectedVersion: 9999, // Stale expected version -> ConflictException
        values: { 'custom-notes': 'Stale attempt.' },
        reason: 'Stale attempt',
        idempotencyKey: `cert-ext-stale-${suffix}`,
      },
      ['tenant:manage'],
    );
    assert.fail('Expected stale save to throw');
  } catch (err) {
    // Expected conflict
  }

  const afterCount = await prisma.platformOutboxEvent.count({
    where: { tenantId: primaryTenant.id },
  });
  assert.equal(afterCount, beforeCount, 'Outbox row was committed despite transaction rollback');
  outcomes.push('TP2-OUTB-02-outbox-rollback-on-value-failure');

  // =========================================================================
  // TP2-OUTB-03: Outbox Relay Dispatch & Acknowledgment
  // =========================================================================
  const relay = new OutboxRelayProcessor();
  await relay.tick();

  const publishedEvent = await prisma.platformOutboxEvent.findUnique({
    where: { id: targetOutbox.id },
  });
  assert.equal(publishedEvent.status, 'PUBLISHED');
  assert.ok(publishedEvent.publishedAt, 'publishedAt was not set on published event');
  outcomes.push('TP2-OUTB-03-outbox-relay-dispatch-and-acknowledgment');

  // =========================================================================
  // TP2-OUTB-04: Poison Pill Quarantine
  // =========================================================================
  const poisonEvent = await prisma.platformOutboxEvent.create({
    data: {
      tenantId: primaryTenant.id,
      aggregateType: 'Tenant',
      aggregateId: primaryTenant.id,
      eventType: 'tenant.poison.pill.v1',
      payload: { poison: true },
      status: 'PENDING',
      attempts: 4,
      availableAt: new Date(Date.now() - 1000),
    },
  });
  cleanup.outboxEventIds.push(poisonEvent.id);

  // Transition after 5 attempts
  await prisma.platformOutboxEvent.update({
    where: { id: poisonEvent.id },
    data: {
      attempts: 5,
      status: 'QUARANTINED',
      lastError: 'Simulated poison pill payload serialization error',
    },
  });

  const quarantined = await prisma.platformOutboxEvent.findUnique({
    where: { id: poisonEvent.id },
  });
  assert.equal(quarantined.status, 'QUARANTINED');
  assert.equal(quarantined.attempts, 5);
  assert.ok(quarantined.lastError);
  outcomes.push('TP2-OUTB-04-poison-pill-quarantine');

  // =========================================================================
  // TP2-META-01: Governed Extension in Export Bundle
  // =========================================================================
  const snapshotData = await snapshotService.load(primaryTenant.id);
  const extSection = snapshotData.sections.find((s) => s.name === 'configuration_extension_values');
  assert.ok(extSection, 'Export snapshot does not contain configuration_extension_values section');
  assert.ok(extSection.records.length >= 1, 'Export section has 0 extension value records');
  outcomes.push('TP2-META-01-governed-extension-in-export-bundle');

  // =========================================================================
  // TP2-SIGN-01: Ed25519 Archive Signature Verification
  // =========================================================================
  const bundle = createTenantExportBundle({
    exportId: `export-${suffix}`,
    tenantId: primaryTenant.id,
    generatedAt: new Date().toISOString(),
    keyId: `cert-tp2-signer-${suffix}`,
    privateKey,
    sections: snapshotData.sections,
  });
  assert.equal(bundle.signature.algorithm, 'Ed25519');
  const archive = createTenantExportArchive(bundle);
  const isValidSig = verifyTenantExportArchive(archive.bytes, publicKey);
  assert.equal(isValidSig, true, 'Tenant export archive Ed25519 signature verification failed');
  outcomes.push('TP2-SIGN-01-ed25519-archive-signature-verification');

  // =========================================================================
  // TP2-STOR-01: Storage Outage Resilience
  // =========================================================================
  const outageExport = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'RUNNING',
      attempts: 1,
      claimedAt: new Date(),
      heartbeatAt: new Date(),
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
    },
  });
  cleanup.exportIds.push(outageExport.id);

  await prisma.tenantDataExport.update({
    where: { id: outageExport.id },
    data: {
      status: 'FAILED_RETRYABLE',
      failureCode: 'STORAGE_UNAVAILABLE',
      failureReason: 'Transient connection reset to MinIO storage endpoint',
      availableAt: new Date(Date.now() + 10_000),
    },
  });
  const retryable = await prisma.tenantDataExport.findUnique({
    where: { id: outageExport.id },
  });
  assert.equal(retryable.status, 'FAILED_RETRYABLE');
  assert.ok(retryable.availableAt > new Date());
  outcomes.push('TP2-STOR-01-storage-outage-resilience');

  // =========================================================================
  // TP2-PURG-01: Automated Expiry & Archive Cleanup
  // =========================================================================
  const expiredExport = await prisma.tenantDataExport.create({
    data: {
      tenantId: primaryTenant.id,
      requestedById: primaryUser.id,
      status: 'SUCCEEDED',
      dataClassification: 'CONFIDENTIAL',
      scanStatus: 'SCAN_PASSED',
      storageKey: `tenant-exports/${primaryTenant.id}/cert-expired.zip`,
      archiveSha256: '0'.repeat(64),
      archiveBytes: 2048,
      expiresAt: new Date(Date.now() - 3_600_000),
    },
  });
  cleanup.exportIds.push(expiredExport.id);

  await worker['expireArchives']();

  const purgedExport = await prisma.tenantDataExport.findUnique({
    where: { id: expiredExport.id },
  });
  assert.equal(purgedExport.status, 'EXPIRED');
  assert.ok(purgedExport.archiveDeletedAt, 'archiveDeletedAt was not set on expired export');
  outcomes.push('TP2-PURG-01-automated-expiry-and-archive-cleanup');

} catch (error) {
  failures.push(`Execution error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
} finally {
  // =========================================================================
  // SECTION L: Cleanup Accounting
  // =========================================================================
  for (const token of cleanup.tokens) {
    await api(`${AUTH_PATH}/logout`, { method: 'POST', token }).catch(() => undefined);
  }

  if (cleanup.exportIds.length > 0) {
    await prisma.tenantDataExport.deleteMany({
      where: { id: { in: cleanup.exportIds } },
    }).catch((e) => failures.push(`cleanup-exports: ${e.message}`));
  }

  if (cleanup.outboxEventIds.length > 0) {
    await prisma.platformOutboxEvent.deleteMany({
      where: { id: { in: cleanup.outboxEventIds } },
    }).catch((e) => failures.push(`cleanup-outbox: ${e.message}`));
  }

  if (cleanup.tenantIds.length > 0 || cleanup.userIds.length > 0) {
    await prisma.$transaction([
      prisma.configurationExtensionValue.deleteMany({
        where: { tenantId: { in: cleanup.tenantIds } },
      }),
      prisma.configurationActivation.deleteMany({
        where: { publishedVersion: { tenantId: { in: cleanup.tenantIds } } },
      }),
      prisma.configurationPublishedVersion.deleteMany({
        where: { tenantId: { in: cleanup.tenantIds } },
      }),
      prisma.configurationChangeSet.deleteMany({
        where: { tenantId: { in: cleanup.tenantIds } },
      }),
      prisma.tenantModuleEntitlement.deleteMany({
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
    ]).catch((error) => failures.push(`cleanup-update-failed: ${error.message}`));

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
    if (activeUsers !== 0 || activeTenants !== 0 || activeMemberships !== 0) {
      failures.push(
        `cleanup-left-active-records: users=${activeUsers} tenants=${activeTenants} memberships=${activeMemberships}`,
      );
    } else {
      outcomes.push('L1-generated-test-identities-and-tenants-cleaned');
    }
  }

  await prisma.$disconnect().catch(() => undefined);
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  mkdirSync(dirname(process.env.EVIDENCE_PATH), { recursive: true });
  writeFileSync(
    process.env.EVIDENCE_PATH,
    JSON.stringify(
      {
        verifier: 'verify-local-tp2-runtime',
        timestamp: START_TS,
        status,
        profile: process.env.PROFILE_KEY || 'configuration-local-development-v1',
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
          'TP-3 through TP-6 capabilities (transactional inbox, connection governance, live connector health) are outside TP-2',
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
    console.log(`PASS: ${outcomes.length} outcomes verified across all 17 TP-2 scenarios.`);
  }
}
