import { createHash } from 'node:crypto';

export const GENESIS_SEAL_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const CurrencyLedgerVerificationState = {
  VALID: 'VALID',
  UNSEALED: 'UNSEALED',
  INVALID: 'INVALID',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type CurrencyLedgerVerificationState =
  (typeof CurrencyLedgerVerificationState)[keyof typeof CurrencyLedgerVerificationState];

export interface ConversionSealInput {
  tenantId: string;
  sequence: number;
  conversionId: string;
  sourceModule: string;
  documentId: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmountMinor: number | string;
  convertedAmountMinor: number | string;
  appliedRateMicros: number | string;
  timestamp: string;
  previousSealHash: string;
}

export interface ConversionSealRecord {
  id: string;
  tenantId: string;
  sourceModule: string;
  documentId: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmountMinor: number | string;
  convertedAmountMinor: number | string;
  appliedRateMicros: number | string;
  calculationTimestamp: string;
  sealSequence?: number | null;
  sealHash?: string | null;
  previousSealHash?: string | null;
}

export interface CurrencyLedgerVerificationResult {
  valid: boolean;
  state: CurrencyLedgerVerificationState;
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
 * Computes deterministic SHA-256 seal for an FX currency conversion record.
 */
export function computeConversionSealHash(input: ConversionSealInput): string {
  const canonicalPayload = canonicalJson({
    appliedRateMicros: String(input.appliedRateMicros),
    conversionId: input.conversionId,
    convertedAmountMinor: String(input.convertedAmountMinor),
    documentId: input.documentId,
    fromCurrency: input.fromCurrency,
    previousSealHash: input.previousSealHash,
    sequence: input.sequence,
    sourceAmountMinor: String(input.sourceAmountMinor),
    sourceModule: input.sourceModule,
    tenantId: input.tenantId,
    timestamp: input.timestamp,
    toCurrency: input.toCurrency,
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Verifies cryptographic continuity and integrity of conversion ledger seals.
 * Operates fail-closed: returns VALID, UNSEALED, INVALID, or INCOMPLETE.
 */
export function verifyConversionLedgerChain(
  records: ConversionSealRecord[],
): CurrencyLedgerVerificationResult {
  if (!records || records.length === 0) {
    return {
      valid: true,
      state: CurrencyLedgerVerificationState.VALID,
      totalRecords: 0,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
    };
  }

  // Filter records that have seal sequence
  const sealed = records.filter(
    (
      r,
    ): r is ConversionSealRecord & {
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
      state: CurrencyLedgerVerificationState.UNSEALED,
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
      error: 'No cryptographic seals found in conversion ledger records',
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
        state: CurrencyLedgerVerificationState.INCOMPLETE,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger sequence gap: expected ${expectedSeq}, received ${c.sealSequence}`,
      };
    }

    if (i > 0 && c.previousSealHash !== expectedPrevHash) {
      return {
        valid: false,
        state: CurrencyLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger seal chain ruptured: expected previousSealHash ${expectedPrevHash}, received ${c.previousSealHash}`,
      };
    }

    const recomputed = computeConversionSealHash({
      tenantId: c.tenantId,
      sequence: c.sealSequence,
      conversionId: c.id,
      sourceModule: c.sourceModule,
      documentId: c.documentId,
      fromCurrency: c.fromCurrency,
      toCurrency: c.toCurrency,
      sourceAmountMinor: c.sourceAmountMinor,
      convertedAmountMinor: c.convertedAmountMinor,
      appliedRateMicros: c.appliedRateMicros,
      timestamp: c.calculationTimestamp,
      previousSealHash: c.previousSealHash,
    });

    if (recomputed !== c.sealHash) {
      return {
        valid: false,
        state: CurrencyLedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Conversion tampering detected: seal mismatch at conversion ${c.id} (seq ${c.sealSequence})`,
      };
    }

    expectedPrevHash = c.sealHash;
    expectedSeq += 1;
  }

  const lastSealed = sealed[sealed.length - 1];
  return {
    valid: true,
    state: CurrencyLedgerVerificationState.VALID,
    totalRecords: records.length,
    verifiedCount: sealed.length,
    headHash: lastSealed?.sealHash ?? GENESIS_SEAL_HASH,
  };
}
