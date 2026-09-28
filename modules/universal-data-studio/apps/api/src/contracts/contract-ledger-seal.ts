import { createHash } from 'node:crypto';

export const GENESIS_SEAL_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const ContractLedgerVerificationState = {
  VALID: 'VALID',
  UNSEALED: 'UNSEALED',
  INVALID: 'INVALID',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type ContractLedgerVerificationState =
  (typeof ContractLedgerVerificationState)[keyof typeof ContractLedgerVerificationState];

export interface ContractSealInput {
  tenantId: string;
  sequence: number;
  contractId: string;
  contractCode: string;
  name: string;
  domain: string;
  activeVersion: string;
  createdAt: string;
  previousSealHash: string;
}

export interface ContractSealRecord {
  id: string;
  tenantId: string;
  contractCode: string;
  name: string;
  domain: string;
  activeVersion: string;
  createdAt: string;
  sealSequence?: number | null;
  sealHash?: string | null;
  previousSealHash?: string | null;
}

export interface ContractLedgerVerificationResult {
  valid: boolean;
  state: ContractLedgerVerificationState;
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
 * Computes deterministic SHA-256 seal for a published data contract.
 */
export function computeContractSealHash(input: ContractSealInput): string {
  const canonicalPayload = canonicalJson({
    activeVersion: input.activeVersion,
    contractCode: input.contractCode,
    contractId: input.contractId,
    createdAt: input.createdAt,
    domain: input.domain,
    name: input.name,
    previousSealHash: input.previousSealHash,
    sequence: input.sequence,
    tenantId: input.tenantId,
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Verifies cryptographic continuity and integrity of tenant data contract seals.
 * Operates fail-closed: returns VALID, UNSEALED, INVALID, or INCOMPLETE.
 */
export function verifyContractLedgerChain(records: ContractSealRecord[]): ContractLedgerVerificationResult {
  if (!records || records.length === 0) {
    return {
      valid: true,
      state: ContractLedgerVerificationState.VALID,
      totalRecords: 0,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
    };
  }

  // Filter records that have seal sequence
  const sealed = records.filter(
    (r): r is ContractSealRecord & { sealSequence: number; sealHash: string; previousSealHash: string } =>
      typeof r.sealSequence === 'number' &&
      typeof r.sealHash === 'string' &&
      typeof r.previousSealHash === 'string',
  );

  if (sealed.length === 0) {
    return {
      valid: false,
      state: ContractLedgerVerificationState.UNSEALED,
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
      error: 'No cryptographic seals found in data contract records',
    };
  }

  // Sort by seal sequence ascending
  sealed.sort((a, b) => a.sealSequence - b.sealSequence);

  let expectedSeq = sealed[0]?.sealSequence ?? 1;
  let expectedPrevHash = sealed[0]?.previousSealHash ?? GENESIS_SEAL_HASH;

  for (let i = 0; i < sealed.length; i++) {
    const c = sealed[i]!;

    if (c.sealSequence !== expectedSeq) {
      return {
        valid: false,
        state: ContractLedgerVerificationState.INCOMPLETE,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger sequence gap: expected ${expectedSeq}, received ${c.sealSequence}`,
      };
    }

    if (i > 0 && c.previousSealHash !== expectedPrevHash) {
      return {
        valid: false,
        state: ContractLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger seal chain ruptured: expected previousSealHash ${expectedPrevHash}, received ${c.previousSealHash}`,
      };
    }

    const recomputed = computeContractSealHash({
      tenantId: c.tenantId,
      sequence: c.sealSequence,
      contractId: c.id,
      contractCode: c.contractCode,
      name: c.name,
      domain: c.domain,
      activeVersion: c.activeVersion,
      createdAt: c.createdAt,
      previousSealHash: c.previousSealHash,
    });

    if (recomputed !== c.sealHash) {
      return {
        valid: false,
        state: ContractLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Contract tampering detected: seal mismatch at contract ${c.contractCode} (seq ${c.sealSequence})`,
      };
    }

    expectedPrevHash = c.sealHash;
    expectedSeq += 1;
  }

  const lastSealed = sealed[sealed.length - 1];
  return {
    valid: true,
    state: ContractLedgerVerificationState.VALID,
    totalRecords: records.length,
    verifiedCount: sealed.length,
    headHash: lastSealed?.sealHash ?? GENESIS_SEAL_HASH,
  };
}
