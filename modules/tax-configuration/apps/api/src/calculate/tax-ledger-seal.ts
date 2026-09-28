import { createHash } from 'node:crypto';

export const GENESIS_SEAL_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const TaxLedgerVerificationState = {
  VALID: 'VALID',
  UNSEALED: 'UNSEALED',
  INVALID: 'INVALID',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type TaxLedgerVerificationState =
  (typeof TaxLedgerVerificationState)[keyof typeof TaxLedgerVerificationState];

export interface TaxCalculationSealInput {
  tenantId: string;
  sequence: number;
  calculationId: string;
  sourceModule: string;
  documentId: string;
  jurisdictionCode: string;
  taxableAmountMinor: number | string;
  calculatedTaxMinor: number | string;
  appliedRateBasisPoints: number | string;
  timestamp: string;
  previousSealHash: string;
}

export interface TaxCalculationSealRecord {
  id: string;
  tenantId: string;
  sourceModule: string;
  documentId: string;
  jurisdictionCode: string;
  taxableAmountMinor: number | string;
  calculatedTaxMinor: number | string;
  appliedRateBasisPoints: number | string;
  calculationTimestamp: string;
  sealSequence?: number | null;
  sealHash?: string | null;
  previousSealHash?: string | null;
}

export interface TaxLedgerVerificationResult {
  valid: boolean;
  state: TaxLedgerVerificationState;
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
 * Computes deterministic SHA-256 seal for a tax determination ledger record.
 */
export function computeTaxCalculationSealHash(input: TaxCalculationSealInput): string {
  const canonicalPayload = canonicalJson({
    appliedRateBasisPoints: String(input.appliedRateBasisPoints),
    calculatedTaxMinor: String(input.calculatedTaxMinor),
    calculationId: input.calculationId,
    documentId: input.documentId,
    jurisdictionCode: input.jurisdictionCode,
    previousSealHash: input.previousSealHash,
    sequence: input.sequence,
    sourceModule: input.sourceModule,
    taxableAmountMinor: String(input.taxableAmountMinor),
    tenantId: input.tenantId,
    timestamp: input.timestamp,
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Verifies cryptographic continuity and integrity of tax determination ledger seals.
 * Operates fail-closed: returns VALID, UNSEALED, INVALID, or INCOMPLETE.
 */
export function verifyTaxLedgerChain(
  records: TaxCalculationSealRecord[],
): TaxLedgerVerificationResult {
  if (!records || records.length === 0) {
    return {
      valid: true,
      state: TaxLedgerVerificationState.VALID,
      totalRecords: 0,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
    };
  }

  const sealed = records.filter(
    (
      r,
    ): r is TaxCalculationSealRecord & {
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
      state: TaxLedgerVerificationState.UNSEALED,
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
      error: 'No cryptographic seals found in tax determination ledger records',
    };
  }

  sealed.sort((a, b) => a.sealSequence - b.sealSequence);

  let expectedSeq = sealed[0]?.sealSequence ?? 1;
  let expectedPrevHash = sealed[0]?.previousSealHash ?? GENESIS_SEAL_HASH;

  for (let i = 0; i < sealed.length; i++) {
    const c = sealed[i]!;

    if (c.sealSequence !== expectedSeq) {
      return {
        valid: false,
        state: TaxLedgerVerificationState.INCOMPLETE,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger sequence gap: expected ${expectedSeq}, received ${c.sealSequence}`,
      };
    }

    if (i > 0 && c.previousSealHash !== expectedPrevHash) {
      return {
        valid: false,
        state: TaxLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger seal chain ruptured: expected previousSealHash ${expectedPrevHash}, received ${c.previousSealHash}`,
      };
    }

    const recomputed = computeTaxCalculationSealHash({
      tenantId: c.tenantId,
      sequence: c.sealSequence,
      calculationId: c.id,
      sourceModule: c.sourceModule,
      documentId: c.documentId,
      jurisdictionCode: c.jurisdictionCode,
      taxableAmountMinor: c.taxableAmountMinor,
      calculatedTaxMinor: c.calculatedTaxMinor,
      appliedRateBasisPoints: c.appliedRateBasisPoints,
      timestamp: c.calculationTimestamp,
      previousSealHash: c.previousSealHash,
    });

    if (recomputed !== c.sealHash) {
      return {
        valid: false,
        state: TaxLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Tax calculation tampering detected: seal mismatch at calculation ${c.id} (seq ${c.sealSequence})`,
      };
    }

    expectedPrevHash = c.sealHash;
    expectedSeq += 1;
  }

  const lastSealed = sealed[sealed.length - 1];
  return {
    valid: true,
    state: TaxLedgerVerificationState.VALID,
    totalRecords: records.length,
    verifiedCount: sealed.length,
    headHash: lastSealed?.sealHash ?? GENESIS_SEAL_HASH,
  };
}
