import { describe, it, expect } from 'vitest';
import {
  computeWorkflowRunSealHash,
  verifyWorkflowRunLedgerChain,
  GENESIS_SEAL_HASH,
  WorkflowLedgerVerificationState,
  type WorkflowRunSealRecord,
} from './workflow-run-seal.js';

describe('workflow-run-seal (Delta-5 Cryptographic Run Ledger Verification)', () => {
  const tenantId = 'tenant-corp-01';

  it('produces deterministic SHA-256 seal hashes', () => {
    const input = {
      tenantId,
      sequence: 1,
      runId: 'run-001',
      workflowCode: 'ORDER_FULFILLMENT',
      version: '1.0.0',
      correlationId: 'corr-100',
      status: 'COMPLETED',
      completedAt: '2026-09-25T11:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const hash1 = computeWorkflowRunSealHash(input);
    const hash2 = computeWorkflowRunSealHash(input);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('changes hash when any run parameter is modified', () => {
    const base = {
      tenantId,
      sequence: 1,
      runId: 'run-001',
      workflowCode: 'ORDER_FULFILLMENT',
      version: '1.0.0',
      correlationId: 'corr-100',
      status: 'COMPLETED',
      completedAt: '2026-09-25T11:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const baseHash = computeWorkflowRunSealHash(base);
    const modStatus = computeWorkflowRunSealHash({ ...base, status: 'FAILED' });
    const modVersion = computeWorkflowRunSealHash({ ...base, version: '1.1.0' });
    const modSeq = computeWorkflowRunSealHash({ ...base, sequence: 2 });

    expect(baseHash).not.toBe(modStatus);
    expect(baseHash).not.toBe(modVersion);
    expect(baseHash).not.toBe(modSeq);
  });

  it('verifies empty run list as VALID with GENESIS_SEAL_HASH', () => {
    const result = verifyWorkflowRunLedgerChain([]);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(WorkflowLedgerVerificationState.VALID);
    expect(result.totalRecords).toBe(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.headHash).toBe(GENESIS_SEAL_HASH);
  });

  it('detects UNSEALED state when records lack seal properties', () => {
    const records: WorkflowRunSealRecord[] = [
      {
        id: 'run-1',
        tenantId,
        workflowCode: 'WF-1',
        version: '1.0.0',
        correlationId: 'corr-1',
        status: 'COMPLETED',
        completedAt: '2026-09-25T11:00:00.000Z',
        sealSequence: null,
        sealHash: null,
        previousSealHash: null,
      },
    ];

    const result = verifyWorkflowRunLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(WorkflowLedgerVerificationState.UNSEALED);
    expect(result.error).toContain('No cryptographic seals found');
  });

  it('verifies a valid multi-block run seal chain', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time2 = '2026-09-25T11:05:00.000Z';
    const time3 = '2026-09-25T11:10:00.000Z';

    const seal1 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 1,
      runId: 'run-1',
      workflowCode: 'WF-1',
      version: '1.0.0',
      correlationId: 'corr-1',
      status: 'COMPLETED',
      completedAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal2 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 2,
      runId: 'run-2',
      workflowCode: 'WF-2',
      version: '1.0.0',
      correlationId: 'corr-2',
      status: 'COMPLETED',
      completedAt: time2,
      previousSealHash: seal1,
    });

    const seal3 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 3,
      runId: 'run-3',
      workflowCode: 'WF-3',
      version: '1.0.0',
      correlationId: 'corr-3',
      status: 'FAILED',
      completedAt: time3,
      previousSealHash: seal2,
    });

    const records: WorkflowRunSealRecord[] = [
      {
        id: 'run-1',
        tenantId,
        workflowCode: 'WF-1',
        version: '1.0.0',
        correlationId: 'corr-1',
        status: 'COMPLETED',
        completedAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'run-2',
        tenantId,
        workflowCode: 'WF-2',
        version: '1.0.0',
        correlationId: 'corr-2',
        status: 'COMPLETED',
        completedAt: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: seal1,
      },
      {
        id: 'run-3',
        tenantId,
        workflowCode: 'WF-3',
        version: '1.0.0',
        correlationId: 'corr-3',
        status: 'FAILED',
        completedAt: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal2,
      },
    ];

    const result = verifyWorkflowRunLedgerChain(records);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(WorkflowLedgerVerificationState.VALID);
    expect(result.verifiedCount).toBe(3);
    expect(result.headHash).toBe(seal3);
  });

  it('detects INCOMPLETE state when there is a sequence gap', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time3 = '2026-09-25T11:10:00.000Z';

    const seal1 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 1,
      runId: 'run-1',
      workflowCode: 'WF-1',
      version: '1.0.0',
      correlationId: 'corr-1',
      status: 'COMPLETED',
      completedAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal3 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 3,
      runId: 'run-3',
      workflowCode: 'WF-3',
      version: '1.0.0',
      correlationId: 'corr-3',
      status: 'COMPLETED',
      completedAt: time3,
      previousSealHash: seal1,
    });

    const records: WorkflowRunSealRecord[] = [
      {
        id: 'run-1',
        tenantId,
        workflowCode: 'WF-1',
        version: '1.0.0',
        correlationId: 'corr-1',
        status: 'COMPLETED',
        completedAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'run-3',
        tenantId,
        workflowCode: 'WF-3',
        version: '1.0.0',
        correlationId: 'corr-3',
        status: 'COMPLETED',
        completedAt: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal1,
      },
    ];

    const result = verifyWorkflowRunLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(WorkflowLedgerVerificationState.INCOMPLETE);
    expect(result.brokenIndex).toBe(1);
    expect(result.error).toContain('Ledger sequence gap');
  });

  it('detects INVALID state when run state has been tampered with', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const seal1 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 1,
      runId: 'run-1',
      workflowCode: 'WF-1',
      version: '1.0.0',
      correlationId: 'corr-1',
      status: 'COMPLETED',
      completedAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const records: WorkflowRunSealRecord[] = [
      {
        id: 'run-1',
        tenantId,
        workflowCode: 'WF-1',
        version: '1.0.0',
        correlationId: 'corr-1',
        status: 'FAILED', // Tampered from COMPLETED!
        completedAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
    ];

    const result = verifyWorkflowRunLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(WorkflowLedgerVerificationState.INVALID);
    expect(result.error).toContain('Workflow run tampering detected');
  });

  it('detects INVALID state when previousSealHash is ruptured', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time2 = '2026-09-25T11:05:00.000Z';

    const seal1 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 1,
      runId: 'run-1',
      workflowCode: 'WF-1',
      version: '1.0.0',
      correlationId: 'corr-1',
      status: 'COMPLETED',
      completedAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const corruptPrevHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const seal2 = computeWorkflowRunSealHash({
      tenantId,
      sequence: 2,
      runId: 'run-2',
      workflowCode: 'WF-2',
      version: '1.0.0',
      correlationId: 'corr-2',
      status: 'COMPLETED',
      completedAt: time2,
      previousSealHash: corruptPrevHash,
    });

    const records: WorkflowRunSealRecord[] = [
      {
        id: 'run-1',
        tenantId,
        workflowCode: 'WF-1',
        version: '1.0.0',
        correlationId: 'corr-1',
        status: 'COMPLETED',
        completedAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'run-2',
        tenantId,
        workflowCode: 'WF-2',
        version: '1.0.0',
        correlationId: 'corr-2',
        status: 'COMPLETED',
        completedAt: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: corruptPrevHash, // Does not link to seal1!
      },
    ];

    const result = verifyWorkflowRunLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(WorkflowLedgerVerificationState.INVALID);
    expect(result.error).toContain('Ledger seal chain ruptured');
  });
});
