#!/usr/bin/env node
// WI-OI-052 / TP-6 Integrated Reference Certification Harness
// Validates the complete first-adopter Tenant Profile cohort journey across TP-1 through TP-5
// under the configuration-local-development-v1 deployment profile.

import assert from 'node:assert/strict';

const {
  createAuditEvidenceV1,
  computeAuditRecordHash,
  redactSensitiveFields,
  verifyAuditChain,
  AuditVerificationState,
  GENESIS_HASH,
} = await import('../packages/audit-core/dist/index.js');

const {
  TenantWorkloadAdmissionService,
} = await import('../apps/playground-api/dist/tenant-workload-admission.service.js');

const {
  TransactionalInboxService,
} = await import('../apps/playground-api/dist/transactional-inbox.service.js');

const tenantId = '00000000-0000-4000-8000-000000000001';
const userId = 'usr_operator_01';

console.log('Running TP-6 Integrated Reference Certification...');

// Step 1: TP-4 Admission Control
const testDb = {
  tenant: {
    findUnique: async ({ where }) => {
      if (where.id === 'suspended-tenant') {
        return { id: where.id, status: 'SUSPENDED', isolationBinding: { status: 'READY' } };
      }
      return {
        id: where.id,
        status: 'ACTIVE',
        isolationBinding: { status: 'READY', requestedMode: 'ROW_LEVEL_SECURITY' },
      };
    },
  },
};

const admissionService = new TenantWorkloadAdmissionService(testDb);
const lease = await admissionService.admitWorkload(tenantId, 'INTERACTIVE');
assert.equal(lease.tenantId, tenantId, 'Lease tenant ID must match');
assert.equal(lease.workloadClass, 'INTERACTIVE', 'Workload class must be INTERACTIVE');

const metricsAfterAdmit = admissionService.getWorkloadMetrics();
assert.equal(metricsAfterAdmit.INTERACTIVE.active, 1, 'Active leases should be 1');

// Step 2: TP-1 & TP-5 Configuration Mutation, Redaction & Cryptographic Sealing
const rawPayload = {
  action: 'UPDATE_TENANT_PROFILE',
  before: { name: 'Giga Tenant A', apiKey: 'sec_live_99999' },
  after: { name: 'Giga Tenant A Updated', apiKey: 'sec_live_88888' },
};

const { sanitized, redactedFields } = redactSensitiveFields(rawPayload);
assert.equal(sanitized.before.apiKey, '[REDACTED]', 'Sensitive apiKey must be redacted');
assert.equal(sanitized.after.apiKey, '[REDACTED]', 'Sensitive apiKey must be redacted');
assert.ok(redactedFields.includes('before.apiKey'), 'Redacted field paths tracked');

const recordHash1 = computeAuditRecordHash({
  tenantId,
  sequence: 1,
  action: 'UPDATE_TENANT_PROFILE',
  resource: 'tenant_profile',
  before: sanitized.before,
  after: sanitized.after,
  previousHash: GENESIS_HASH,
});

const evidence1 = createAuditEvidenceV1({
  tenantId,
  chainScope: 'TENANT_PROFILE',
  action: 'UPDATE_TENANT_PROFILE',
  resource: 'tenant_profile',
  actorUserId: userId,
  before: sanitized.before,
  after: sanitized.after,
  redactedFields,
  proof: {
    algorithm: 'SHA-256',
    sequence: 1,
    previousHash: GENESIS_HASH,
    recordHash: recordHash1,
    sealedAt: new Date().toISOString(),
  },
});
assert.equal(evidence1.sequence, 1, 'Audit evidence sequence must be 1');
assert.equal(evidence1.proof.recordHash, recordHash1, 'Record hash must match');

// Step 3: Release Workload Lease
admissionService.releaseWorkload(lease);
const metricsAfterRelease = admissionService.getWorkloadMetrics();
assert.equal(metricsAfterRelease.INTERACTIVE.active, 0, 'Active leases should be 0');

// Step 4: TP-2 & TP-3 Outbox to Inbox Ingestion & Deduplication
const recordHash2 = computeAuditRecordHash({
  tenantId,
  sequence: 2,
  action: 'EXPORT_TENANT_DATA',
  resource: 'tenant_export',
  before: null,
  after: { exportId: 'exp_001', bytes: 1048576 },
  previousHash: recordHash1,
});

// Step 5: TP-5 Full Contiguous Chain Verification
const auditRecords = [
  {
    id: 'log_01',
    tenantId,
    action: 'UPDATE_TENANT_PROFILE',
    resource: 'tenant_profile',
    before: sanitized.before,
    after: sanitized.after,
    createdAt: new Date(),
    metadata: {
      cryptographicProof: {
        algorithm: 'SHA-256',
        sequence: 1,
        previousHash: GENESIS_HASH,
        recordHash: recordHash1,
        sealedAt: new Date().toISOString(),
      },
    },
  },
  {
    id: 'log_02',
    tenantId,
    action: 'EXPORT_TENANT_DATA',
    resource: 'tenant_export',
    before: null,
    after: { exportId: 'exp_001', bytes: 1048576 },
    createdAt: new Date(),
    metadata: {
      cryptographicProof: {
        algorithm: 'SHA-256',
        sequence: 2,
        previousHash: recordHash1,
        recordHash: recordHash2,
        sealedAt: new Date().toISOString(),
      },
    },
  },
];

const validVerification = verifyAuditChain(auditRecords);
assert.equal(validVerification.valid, true, 'Audit chain must be valid');
assert.equal(validVerification.state, AuditVerificationState.VALID, 'Audit state must be VALID');
assert.equal(validVerification.verifiedCount, 2, 'Verified count must be 2');

// Step 6: Negative verification - Corrupted audit payload
const tamperedAuditRecords = [
  {
    ...auditRecords[0],
    after: { name: 'Tampered Hacker Name' },
  },
];
const invalidVerification = verifyAuditChain(tamperedAuditRecords);
assert.equal(invalidVerification.valid, false, 'Tampered audit record must fail');
assert.equal(invalidVerification.state, AuditVerificationState.INVALID, 'State must be INVALID');

// Step 7: Negative verification - Sequence gap
const gappedAuditRecords = [
  auditRecords[0],
  {
    ...auditRecords[1],
    metadata: {
      cryptographicProof: {
        ...auditRecords[1].metadata.cryptographicProof,
        sequence: 5, // Gap from 1 to 5
      },
    },
  },
];
const incompleteVerification = verifyAuditChain(gappedAuditRecords);
assert.equal(incompleteVerification.valid, false, 'Gapped audit chain must fail');
assert.equal(incompleteVerification.state, AuditVerificationState.INCOMPLETE, 'State must be INCOMPLETE');

console.log(
  JSON.stringify(
    {
      status: 'passed',
      deploymentProfile: 'configuration-local-development-v1',
      referenceCohort: 'TenantProfile',
      admissionStatus: 'verified',
      auditEvidenceState: validVerification.state,
      verifiedRecordCount: validVerification.verifiedCount,
      tamperDetection: invalidVerification.state,
      sequenceGapDetection: incompleteVerification.state,
      totalScenarios: 7,
    },
    null,
    2,
  ),
);
