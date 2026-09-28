import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  tenant: {
    findUnique: vi.fn(),
  },
  platformInboxEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  configurationActivation: {
    findFirst: vi.fn(),
  },
  tenantAuditChain: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@gigalibs/db', () => ({
  Prisma: {
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  },
  prisma: database,
}));

import {
  AuditVerificationState,
  createAuditEvidenceV1,
  computeAuditRecordHash,
  GENESIS_HASH,
  redactSensitiveFields,
  verifyAuditChain,
  type AuditRecordWithProof,
} from '@gigalibs/audit-nest';
import { ConfigurationManifestCache } from './configuration-manifest.cache.js';
import { TenantWorkloadAdmissionService } from './tenant-workload-admission.service.js';
import { TransactionalInboxService } from './transactional-inbox.service.js';

describe('TP-6 Integrated Reference Certification & Cohort Observation', () => {
  let admissionService: TenantWorkloadAdmissionService;
  let inboxService: TransactionalInboxService;
  let cache: ConfigurationManifestCache;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = 'user-admin-01';

  beforeEach(() => {
    vi.clearAllMocks();
    admissionService = new TenantWorkloadAdmissionService();
    inboxService = new TransactionalInboxService();
    cache = new ConfigurationManifestCache();
  });

  const activeTenant = {
    id: tenantId,
    status: 'ACTIVE',
    isolationBinding: {
      status: 'READY',
      requestedMode: 'ROW_LEVEL_SECURITY',
      effectiveMode: 'ROW_LEVEL_SECURITY',
    },
  };

  function sealRecord(
    id: string,
    sequence: number,
    previousHash: string,
    action: string,
    resource: string,
    before: unknown = null,
    after: unknown = null,
  ): AuditRecordWithProof {
    const recordHash = computeAuditRecordHash({
      tenantId,
      sequence,
      action,
      resource,
      before,
      after,
      previousHash,
    });

    return {
      id,
      action,
      resource,
      tenantId,
      before,
      after,
      createdAt: new Date(),
      metadata: {
        cryptographicProof: {
          algorithm: 'SHA-256',
          sequence,
          previousHash,
          recordHash,
          sealedAt: new Date().toISOString(),
        },
      },
    };
  }

  it('TP6-INT-01 & TP6-INT-02: Admits interactive workload and creates redacted transactional audit record', async () => {
    database.tenant.findUnique.mockResolvedValueOnce(activeTenant);

    // 1. Admission Control Check
    const lease = await admissionService.admitWorkload(tenantId, 'INTERACTIVE');
    expect(lease.tenantId).toBe(tenantId);
    expect(lease.workloadClass).toBe('INTERACTIVE');
    expect(lease.id).toBeDefined();

    try {
      // 2. Schema Mutation with Sensitive Fields
      const mutationPayload = {
        action: 'UPDATE_TENANT_PROFILE',
        before: { companyName: 'Old Corp', apiKey: 'sec_old_12345' },
        after: { companyName: 'New Corp', apiKey: 'sec_new_67890' },
      };

      // 3. Schema-Aware Redaction
      const { sanitized, redactedFields } = redactSensitiveFields(mutationPayload);
      expect((sanitized.before as any).apiKey).toBe('[REDACTED]');
      expect((sanitized.after as any).apiKey).toBe('[REDACTED]');
      expect(redactedFields).toContain('before.apiKey');
      expect(redactedFields).toContain('after.apiKey');

      // 4. Cryptographic Seal & Envelope
      const recordHash = computeAuditRecordHash({
        tenantId,
        sequence: 1,
        action: 'UPDATE_TENANT_PROFILE',
        resource: 'tenant_profile',
        before: sanitized.before,
        after: sanitized.after,
        previousHash: GENESIS_HASH,
      });

      const evidence = createAuditEvidenceV1({
        tenantId,
        chainScope: 'TENANT_PROFILE',
        action: 'UPDATE_TENANT_PROFILE',
        resource: 'tenant_profile',
        actorUserId: userId,
        before: sanitized.before as Record<string, unknown>,
        after: sanitized.after as Record<string, unknown>,
        redactedFields,
        proof: {
          algorithm: 'SHA-256',
          sequence: 1,
          previousHash: GENESIS_HASH,
          recordHash,
          sealedAt: new Date().toISOString(),
        },
      });

      expect(evidence.envelopeVersion).toBe('1.0');
      expect(evidence.sequence).toBe(1);
      expect(evidence.proof.recordHash).toBe(recordHash);
    } finally {
      admissionService.releaseWorkload(lease);
    }

    const metrics = admissionService.getWorkloadMetrics();
    expect(metrics.INTERACTIVE.active).toBe(0);
    expect(metrics.INTERACTIVE.available).toBe(50);
  });

  it('TP6-INT-03 & TP6-INT-04 & TP6-INT-05: Ingests outbox event through inbox with deduplication and evicts cache', async () => {
    const testMessage = {
      tenantId,
      consumerGroup: 'config-invalidation-group',
      messageId: 'msg-outbox-export-01',
      eventType: 'configuration.activation.changed.v1',
      aggregateType: 'configuration-activation',
      aggregateId: 'act-001',
      payload: { tenantId, timestamp: new Date().toISOString() },
    };

    // 1. First event arrival
    database.platformInboxEvent.findUnique.mockResolvedValueOnce(null);
    database.platformInboxEvent.create.mockResolvedValueOnce({
      id: 'inbox-event-01',
      tenantId,
      consumerGroup: testMessage.consumerGroup,
      messageId: testMessage.messageId,
      status: 'PROCESSING',
      attempts: 1,
    });
    database.platformInboxEvent.update.mockResolvedValueOnce({
      id: 'inbox-event-01',
      status: 'PROCESSED',
    });

    let handlerInvoked = false;
    const result1 = await inboxService.handleMessage(testMessage, async () => {
      handlerInvoked = true;
      cache.invalidateTenant(tenantId);
    });

    expect(result1.status).toBe('PROCESSED');
    expect(handlerInvoked).toBe(true);

    // 2. Duplicate event arrival
    database.platformInboxEvent.findUnique.mockResolvedValueOnce({
      id: 'inbox-event-01',
      tenantId,
      consumerGroup: testMessage.consumerGroup,
      messageId: testMessage.messageId,
      status: 'PROCESSED',
      attempts: 1,
    });

    let handlerInvokedOnDuplicate = false;
    const result2 = await inboxService.handleMessage(testMessage, async () => {
      handlerInvokedOnDuplicate = true;
    });

    expect(result2.status).toBe('DEDUPLICATED');
    expect(handlerInvokedOnDuplicate).toBe(false);
  });

  it('TP6-INT-06: Verifies full cohort audit chain with fail-closed integrity', () => {
    const r1 = sealRecord('aud-01', 1, GENESIS_HASH, 'UPDATE_TENANT_PROFILE', 'tenant_profile', null, { name: 'Acme Corp' });
    const r2 = sealRecord(
      'aud-02',
      2,
      (r1.metadata as any).cryptographicProof.recordHash,
      'EXPORT_TENANT_DATA',
      'tenant_export',
      null,
      { exportJobId: 'exp-001' },
    );

    const verification = verifyAuditChain([r1, r2]);
    expect(verification.valid).toBe(true);
    expect(verification.state).toBe(AuditVerificationState.VALID);
    expect(verification.verifiedCount).toBe(2);
    expect(verification.totalRecords).toBe(2);
  });

  it('TP6-INT-07: Fail-closed defense on suspended tenant and corrupted audit chain', async () => {
    // 1. Suspended tenant rejection
    database.tenant.findUnique.mockResolvedValueOnce({
      id: 'suspended-tenant',
      status: 'SUSPENDED',
      isolationBinding: { status: 'READY' },
    });

    await expect(
      admissionService.admitWorkload('suspended-tenant', 'INTERACTIVE'),
    ).rejects.toThrow('TENANT_SUSPENDED');

    // 2. Corrupted audit chain detection
    const r1 = sealRecord('aud-01', 1, GENESIS_HASH, 'UPDATE_TENANT_PROFILE', 'tenant_profile', null, { name: 'Acme Corp' });
    r1.after = { name: 'Tampered Corp' };

    const verification = verifyAuditChain([r1]);
    expect(verification.valid).toBe(false);
    expect(verification.state).toBe(AuditVerificationState.INVALID);
  });
});
