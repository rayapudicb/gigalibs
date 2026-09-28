import { createHash } from 'node:crypto';

export const GENESIS_SEAL_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const WorkflowLedgerVerificationState = {
  VALID: 'VALID',
  UNSEALED: 'UNSEALED',
  INVALID: 'INVALID',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type WorkflowLedgerVerificationState =
  (typeof WorkflowLedgerVerificationState)[keyof typeof WorkflowLedgerVerificationState];

export interface WorkflowRunSealInput {
  tenantId: string;
  sequence: number;
  runId: string;
  workflowCode: string;
  version: string;
  correlationId: string;
  status: string;
  completedAt: string;
  previousSealHash: string;
}

export interface WorkflowRunSealRecord {
  id: string;
  tenantId: string;
  workflowCode: string;
  version: string;
  correlationId: string;
  status: string;
  completedAt?: string | null;
  sealSequence?: number | null;
  sealHash?: string | null;
  previousSealHash?: string | null;
}

export interface WorkflowLedgerVerificationResult {
  valid: boolean;
  state: WorkflowLedgerVerificationState;
  totalRecords: number;
  verifiedCount: number;
  brokenIndex?: number;
  error?: string;
  headHash?: string;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (value as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJson(val);
  });
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 seal for a completed workflow run.
 */
export function computeWorkflowRunSealHash(input: WorkflowRunSealInput): string {
  const canonicalPayload = canonicalJson({
    completedAt: input.completedAt,
    correlationId: input.correlationId,
    previousSealHash: input.previousSealHash,
    runId: input.runId,
    sequence: input.sequence,
    status: input.status,
    tenantId: input.tenantId,
    version: input.version,
    workflowCode: input.workflowCode,
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Verifies cryptographic continuity and integrity of workflow execution run seals.
 * Operates fail-closed: returns VALID, UNSEALED, INVALID, or INCOMPLETE.
 */
export function verifyWorkflowRunLedgerChain(
  records: WorkflowRunSealRecord[],
): WorkflowLedgerVerificationResult {
  if (!records || records.length === 0) {
    return {
      valid: true,
      state: WorkflowLedgerVerificationState.VALID,
      totalRecords: 0,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
    };
  }

  // Filter records that have seal sequence
  const sealed = records.filter(
    (
      r,
    ): r is WorkflowRunSealRecord & {
      sealSequence: number;
      sealHash: string;
      previousSealHash: string;
    } =>
      typeof r.sealSequence === 'number' &&
      typeof r.sealHash === 'string' &&
      typeof r.previousSealHash === 'string',
  );

  if (sealed.length === 0) {
    return {
      valid: false,
      state: WorkflowLedgerVerificationState.UNSEALED,
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
      error: 'No cryptographic seals found in workflow run records',
    };
  }

  // Sort by seal sequence ascending
  sealed.sort((a, b) => a.sealSequence - b.sealSequence);

  let expectedSeq = sealed[0]?.sealSequence ?? 1;
  let expectedPrevHash = sealed[0]?.previousSealHash ?? GENESIS_SEAL_HASH;

  for (let i = 0; i < sealed.length; i++) {
    const r = sealed[i]!;

    if (r.sealSequence !== expectedSeq) {
      return {
        valid: false,
        state: WorkflowLedgerVerificationState.INCOMPLETE,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger sequence gap: expected ${expectedSeq}, received ${r.sealSequence}`,
      };
    }

    if (i > 0 && r.previousSealHash !== expectedPrevHash) {
      return {
        valid: false,
        state: WorkflowLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger seal chain ruptured: expected previousSealHash ${expectedPrevHash}, received ${r.previousSealHash}`,
      };
    }

    const recomputed = computeWorkflowRunSealHash({
      tenantId: r.tenantId,
      sequence: r.sealSequence,
      runId: r.id,
      workflowCode: r.workflowCode,
      version: r.version,
      correlationId: r.correlationId,
      status: r.status,
      completedAt: r.completedAt || '',
      previousSealHash: r.previousSealHash,
    });

    if (recomputed !== r.sealHash) {
      return {
        valid: false,
        state: WorkflowLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Workflow run tampering detected: seal mismatch at run ${r.id} (seq ${r.sealSequence})`,
      };
    }

    expectedPrevHash = r.sealHash;
    expectedSeq += 1;
  }

  const lastSealed = sealed[sealed.length - 1];
  return {
    valid: true,
    state: WorkflowLedgerVerificationState.VALID,
    totalRecords: records.length,
    verifiedCount: sealed.length,
    headHash: lastSealed?.sealHash ?? GENESIS_SEAL_HASH,
  };
}
