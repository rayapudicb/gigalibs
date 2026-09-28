import { createHash } from 'node:crypto';

export const GENESIS_SEAL_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const LedgerVerificationState = {
  VALID: 'VALID',
  UNSEALED: 'UNSEALED',
  INVALID: 'INVALID',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type LedgerVerificationState =
  (typeof LedgerVerificationState)[keyof typeof LedgerVerificationState];

export interface InvoiceSealInput {
  tenantId: string;
  sequence: number;
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  issuedAt: string;
  previousSealHash: string;
}

export interface InvoiceSealRecord {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  issuedAt: string;
  sealSequence?: number | null;
  sealHash?: string | null;
  previousSealHash?: string | null;
}

export interface LedgerVerificationResult {
  valid: boolean;
  state: LedgerVerificationState;
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
 * Computes deterministic SHA-256 seal for an issued invoice.
 */
export function computeInvoiceSealHash(input: InvoiceSealInput): string {
  const canonicalPayload = canonicalJson({
    currency: input.currency,
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    issuedAt: input.issuedAt,
    previousSealHash: input.previousSealHash,
    sequence: input.sequence,
    subtotalMinor: input.subtotalMinor,
    taxMinor: input.taxMinor,
    tenantId: input.tenantId,
    totalMinor: input.totalMinor,
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Verifies cryptographic continuity and financial integrity of tenant invoice seals.
 * Operates fail-closed: returns VALID, UNSEALED, INVALID, or INCOMPLETE.
 */
export function verifyInvoiceLedgerChain(records: InvoiceSealRecord[]): LedgerVerificationResult {
  if (!records || records.length === 0) {
    return {
      valid: true,
      state: LedgerVerificationState.VALID,
      totalRecords: 0,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
    };
  }

  // Filter records that have seal sequence
  const sealed = records.filter(
    (r): r is InvoiceSealRecord & { sealSequence: number; sealHash: string; previousSealHash: string } =>
      typeof r.sealSequence === 'number' &&
      typeof r.sealHash === 'string' &&
      typeof r.previousSealHash === 'string',
  );

  if (sealed.length === 0) {
    return {
      valid: false,
      state: LedgerVerificationState.UNSEALED,
      totalRecords: records.length,
      verifiedCount: 0,
      headHash: GENESIS_SEAL_HASH,
      error: 'No cryptographic seals found in invoice records',
    };
  }

  // Sort by seal sequence ascending
  sealed.sort((a, b) => a.sealSequence - b.sealSequence);

  let expectedSeq = sealed[0]?.sealSequence ?? 1;
  let expectedPrevHash = sealed[0]?.previousSealHash ?? GENESIS_SEAL_HASH;

  for (let i = 0; i < sealed.length; i++) {
    const inv = sealed[i]!;

    if (inv.sealSequence !== expectedSeq) {
      return {
        valid: false,
        state: LedgerVerificationState.INCOMPLETE,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger sequence gap: expected ${expectedSeq}, received ${inv.sealSequence}`,
      };
    }

    if (i > 0 && inv.previousSealHash !== expectedPrevHash) {
      return {
        valid: false,
        state: LedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Ledger seal chain ruptured: expected previousSealHash ${expectedPrevHash}, received ${inv.previousSealHash}`,
      };
    }

    const recomputed = computeInvoiceSealHash({
      tenantId: inv.tenantId,
      sequence: inv.sealSequence,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      subtotalMinor: inv.subtotalMinor,
      taxMinor: inv.taxMinor,
      totalMinor: inv.totalMinor,
      issuedAt: inv.issuedAt,
      previousSealHash: inv.previousSealHash,
    });

    if (recomputed !== inv.sealHash) {
      return {
        valid: false,
        state: LedgerVerificationState.INVALID,
        totalRecords: records.length,
        verifiedCount: i,
        brokenIndex: i,
        error: `Financial tampering detected: seal mismatch at invoice ${inv.invoiceNumber} (seq ${inv.sealSequence})`,
      };
    }

    expectedPrevHash = inv.sealHash;
    expectedSeq += 1;
  }

  const lastSealed = sealed[sealed.length - 1];
  return {
    valid: true,
    state: LedgerVerificationState.VALID,
    totalRecords: records.length,
    verifiedCount: sealed.length,
    headHash: lastSealed?.sealHash ?? GENESIS_SEAL_HASH,
  };
}
