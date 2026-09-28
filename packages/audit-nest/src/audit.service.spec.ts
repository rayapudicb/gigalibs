import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  auditLog: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock('@gigalibs/db', () => ({
  Prisma: {
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  },
  prisma: database,
}));

import { AuditService } from './audit.service.js';

describe('AuditService (TP-5 Transactional Audit)', () => {
  let service: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditService();
  });

  it('TP5-AUD-01: allocates sequence monotonically from tenant_audit_chains checkpoint', async () => {
    database.$queryRaw.mockResolvedValueOnce([
      { lastSequence: 41n, headHash: 'head_hash_41' },
    ]);
    database.$executeRaw.mockResolvedValueOnce(1);
    database.auditLog.create.mockImplementationOnce(async ({ data }: any) => ({
      id: 'audit_042',
      ...data,
    }));

    const result = await service.log({
      action: 'UPDATE',
      resource: 'tenant_profile',
      tenantId: 'tenant_omega',
      before: { name: 'Old Co' },
      after: { name: 'New Co' },
    });

    expect(result.id).toBe('audit_042');
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    expect(database.$executeRaw).toHaveBeenCalledTimes(1);

    const createdMetadata = (database.auditLog.create.mock.calls[0] as any)[0].data.metadata;
    expect(createdMetadata.cryptographicProof.sequence).toBe(42);
    expect(createdMetadata.cryptographicProof.previousHash).toBe('head_hash_41');
    expect(createdMetadata.auditEvidence.sequence).toBe(42);
    expect(createdMetadata.auditEvidence.envelopeVersion).toBe('1.0');
  });

  it('TP5-AUD-02: automatically redacts sensitive fields before persisting audit logs', async () => {
    database.$queryRaw.mockResolvedValueOnce([]); // Genesis
    database.$executeRaw.mockResolvedValueOnce(1);
    database.auditLog.create.mockImplementationOnce(async ({ data }: any) => ({
      id: 'audit_genesis',
      ...data,
    }));

    await service.log({
      action: 'CREATE',
      resource: 'api_credential',
      tenantId: 'tenant_omega',
      after: {
        username: 'admin',
        password: 'cleartext-password-123',
        apiKey: 'secret-api-key',
      },
    });

    const createCall = (database.auditLog.create.mock.calls[0] as any)[0].data;
    expect(createCall.after).toEqual({
      username: 'admin',
      password: '[REDACTED]',
      apiKey: '[REDACTED]',
    });

    const evidence = createCall.metadata.auditEvidence;
    expect(evidence.redactedFields).toContain('password');
    expect(evidence.redactedFields).toContain('apiKey');
  });

  it('TP5-AUD-06: verifies tenant audit chain returning discrete state and validity', async () => {
    const sealedLogs = [
      {
        id: 'audit_1',
        action: 'CREATE',
        resource: 'tenant',
        tenantId: 'tenant_01',
        before: null,
        after: { name: 'Tenant 1' },
        createdAt: new Date(),
        metadata: {
          cryptographicProof: {
            algorithm: 'SHA-256',
            sequence: 1,
            previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
            recordHash: 'dummy',
            sealedAt: new Date().toISOString(),
          },
        },
      },
    ];

    // Compute valid hash for record
    const { computeAuditRecordHash } = await import('@gigalibs/audit-core');
    sealedLogs[0]!.metadata.cryptographicProof.recordHash = computeAuditRecordHash({
      tenantId: 'tenant_01',
      sequence: 1,
      action: 'CREATE',
      resource: 'tenant',
      before: null,
      after: { name: 'Tenant 1' },
      previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    });

    database.auditLog.findMany.mockResolvedValueOnce(sealedLogs);

    const verification = await service.verifyTenantChain('tenant_01');

    expect(verification.valid).toBe(true);
    expect(verification.state).toBe('VALID');
    expect(verification.verifiedCount).toBe(1);
  });
});
