import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditCryptographicProof {
  algorithm: 'SHA-256';
  sequence: number;
  previousHash: string;
  recordHash: string;
  sealedAt: string;
}

export interface ChainedAuditInput {
  tenantId?: string | undefined;
  sequence: number;
  action: string;
  resource: string;
  resourceId?: string | undefined;
  userId?: string | undefined;
  before?: unknown;
  after?: unknown;
  previousHash: string;
}

export function canonicalJson(value: unknown): string {
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

export function computeAuditRecordHash(input: ChainedAuditInput): string {
  const canonical = canonicalJson({
    tenantId: input.tenantId ?? '',
    sequence: input.sequence,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? '',
    userId: input.userId ?? '',
    before: input.before ?? null,
    after: input.after ?? null,
    previousHash: input.previousHash,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export const AuditVerificationState = {
  VALID: 'VALID',
  UNSEALED: 'UNSEALED',
  INVALID: 'INVALID',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type AuditVerificationState =
  (typeof AuditVerificationState)[keyof typeof AuditVerificationState];

export interface ChainVerificationResult {
  valid: boolean;
  state: AuditVerificationState;
  totalRecords: number;
  verifiedCount: number;
  brokenIndex?: number;
  error?: string;
  headHash?: string;
}

export interface AuditRecordWithProof {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  createdAt: Date | string;
}

export function verifyAuditChain(records: AuditRecordWithProof[]): ChainVerificationResult {
  if (!records || records.length === 0) {
    return {
      valid: true,
      state: 'VALID',
      totalRecords: 0,
      verifiedCount: 0,
      headHash: GENESIS_HASH,
    };
  }

  // Filter records that have cryptographic proof
  const chainedRecords: { record: AuditRecordWithProof; proof: AuditCryptographicProof }[] = [];
  for (const record of records) {
    const meta = (record.metadata as Record<string, unknown>) || {};
    const proof = meta.cryptographicProof as AuditCryptographicProof | undefined;
    if (proof && proof.recordHash && proof.previousHash) {
      chainedRecords.push({ record, proof });
    }
  }

  if (chainedRecords.length === 0) {
    return {
      valid: false,
      state: 'UNSEALED',
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_HASH,
      error: 'No cryptographic proofs found in audit records',
    };
  }

  // Sort by sequence ascending
  chainedRecords.sort((a, b) => a.proof.sequence - b.proof.sequence);

  const first = chainedRecords[0];
  if (!first) {
    return {
      valid: false,
      state: 'UNSEALED',
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_HASH,
      error: 'No cryptographic proofs found in audit records',
    };
  }

  let expectedPrevHash = GENESIS_HASH;
  let expectedSeq = first.proof.sequence;

  for (let i = 0; i < chainedRecords.length; i++) {
    const item = chainedRecords[i]!;
    const { record, proof } = item;

    if (proof.sequence !== expectedSeq) {
      return {
        valid: false,
        state: 'INCOMPLETE',
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Sequence gap detected: expected ${expectedSeq}, received ${proof.sequence}`,
      };
    }

    if (i > 0 && proof.previousHash !== expectedPrevHash) {
      return {
        valid: false,
        state: 'INVALID',
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Hash chain ruptured: expected previousHash ${expectedPrevHash}, received ${proof.previousHash}`,
      };
    }

    // Recompute hash
    const recomputed = computeAuditRecordHash({
      tenantId: record.tenantId ?? undefined,
      sequence: proof.sequence,
      action: record.action,
      resource: record.resource,
      resourceId: record.resourceId ?? undefined,
      userId: record.userId ?? undefined,
      before: record.before,
      after: record.after,
      previousHash: proof.previousHash,
    });

    if (recomputed !== proof.recordHash) {
      return {
        valid: false,
        state: 'INVALID',
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Tampering detected at record ${record.id}: recomputed hash ${recomputed} does not match sealed hash ${proof.recordHash}`,
      };
    }

    expectedPrevHash = proof.recordHash;
    expectedSeq += 1;
  }

  if (chainedRecords.length < records.length) {
    return {
      valid: false,
      state: 'UNSEALED',
      totalRecords: records.length,
      verifiedCount: chainedRecords.length,
      headHash: expectedPrevHash,
      error: `Unsealed records present: ${records.length - chainedRecords.length} records lack cryptographic proof`,
    };
  }

  return {
    valid: true,
    state: 'VALID',
    totalRecords: records.length,
    verifiedCount: chainedRecords.length,
    headHash: expectedPrevHash,
  };
}
