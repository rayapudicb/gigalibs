import { describe, expect, it } from 'vitest';
import { createAuditEvidenceV1 } from './evidence.js';
import {
  GENESIS_HASH,
  computeAuditRecordHash,
  verifyAuditChain,
  type AuditCryptographicProof,
  type AuditRecordWithProof,
} from './hash-chain.js';
import { redactSensitiveFields } from './redaction.js';

describe('redactSensitiveFields', () => {
  it('TP5-AUD-02: automatically redacts sensitive parameters and tracks their paths', () => {
    const input = {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'super-secret-password',
      config: {
        apiKey: 'key_123456789',
        nested: {
          clientSecret: 'secret_abc_xyz',
          totpSecret: 'JBSWY3DPEHPK3PXP',
        },
      },
      tokens: ['token_aaa', 'token_bbb'],
      account: {
        creditCard: '4111111111111111',
        cvv: '123',
        ssn: '000-12-3456',
      },
    };

    const result = redactSensitiveFields(input);

    expect(result.sanitized.name).toBe('Alice');
    expect(result.sanitized.email).toBe('alice@example.com');
    expect(result.sanitized.password).toBe('[REDACTED]');
    expect(result.sanitized.config.apiKey).toBe('[REDACTED]');
    expect(result.sanitized.config.nested.clientSecret).toBe('[REDACTED]');
    expect(result.sanitized.config.nested.totpSecret).toBe('[REDACTED]');
    expect(result.sanitized.account.creditCard).toBe('[REDACTED]');
    expect(result.sanitized.account.cvv).toBe('[REDACTED]');
    expect(result.sanitized.account.ssn).toBe('[REDACTED]');

    expect(result.redactedFields).toContain('password');
    expect(result.redactedFields).toContain('config.apiKey');
    expect(result.redactedFields).toContain('config.nested.clientSecret');
    expect(result.redactedFields).toContain('config.nested.totpSecret');
    expect(result.redactedFields).toContain('account.creditCard');
    expect(result.redactedFields).toContain('account.cvv');
    expect(result.redactedFields).toContain('account.ssn');
  });
});

describe('createAuditEvidenceV1', () => {
  it('builds an AuditEvidenceV1 envelope', () => {
    const proof: AuditCryptographicProof = {
      algorithm: 'SHA-256',
      sequence: 1,
      previousHash: GENESIS_HASH,
      recordHash: 'hash_001',
      sealedAt: new Date().toISOString(),
    };

    const evidence = createAuditEvidenceV1({
      tenantId: 'tenant_test',
      action: 'tenant.profile.updated',
      resource: 'tenant_profile',
      redactedFields: ['password'],
      proof,
    });

    expect(evidence.envelopeVersion).toBe('1.0');
    expect(evidence.tenantId).toBe('tenant_test');
    expect(evidence.chainScope).toBe('default');
    expect(evidence.sequence).toBe(1);
    expect(evidence.redactedFields).toEqual(['password']);
  });
});

describe('verifyAuditChain fail-closed state evaluation', () => {
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
      tenantId: 'tenant_01',
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
      tenantId: 'tenant_01',
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

  it('TP5-AUD-06: returns VALID for an unbroken valid hash chain', () => {
    const r1 = sealRecord('log_1', 1, GENESIS_HASH, 'user.login', 'session');
    const r2 = sealRecord(
      'log_2',
      2,
      (r1.metadata as any).cryptographicProof.recordHash,
      'profile.update',
      'user',
    );

    const result = verifyAuditChain([r1, r2]);

    expect(result.valid).toBe(true);
    expect(result.state).toBe('VALID');
    expect(result.verifiedCount).toBe(2);
    expect(result.totalRecords).toBe(2);
  });

  it('TP5-AUD-05: returns UNSEALED when audit records lack cryptographic proofs', () => {
    const unsealedRecord: AuditRecordWithProof = {
      id: 'log_unsealed',
      action: 'unsealed.action',
      resource: 'config',
      tenantId: 'tenant_01',
      createdAt: new Date(),
      metadata: {},
    };

    const result = verifyAuditChain([unsealedRecord]);

    expect(result.valid).toBe(false);
    expect(result.state).toBe('UNSEALED');
  });

  it('TP5-AUD-03: returns INCOMPLETE when a sequence gap exists in the chain', () => {
    const r1 = sealRecord('log_1', 1, GENESIS_HASH, 'user.login', 'session');
    // Sequence 3 instead of 2 -> GAP!
    const r3 = sealRecord(
      'log_3',
      3,
      (r1.metadata as any).cryptographicProof.recordHash,
      'profile.update',
      'user',
    );

    const result = verifyAuditChain([r1, r3]);

    expect(result.valid).toBe(false);
    expect(result.state).toBe('INCOMPLETE');
    expect(result.error).toContain('Sequence gap detected');
  });

  it('TP5-AUD-04: returns INVALID when record payload is tampered', () => {
    const r1 = sealRecord('log_1', 1, GENESIS_HASH, 'invoice.issue', 'invoice', null, {
      amount: 100,
    });

    // Tamper after field
    r1.after = { amount: 999999 };

    const result = verifyAuditChain([r1]);

    expect(result.valid).toBe(false);
    expect(result.state).toBe('INVALID');
    expect(result.error).toContain('Tampering detected');
  });
});
