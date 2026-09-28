import { describe, it, expect } from 'vitest';
import {
  computeTaxCalculationSealHash,
  verifyTaxLedgerChain,
  GENESIS_SEAL_HASH,
  TaxLedgerVerificationState,
  type TaxCalculationSealRecord,
} from './tax-ledger-seal.js';

describe('tax-ledger-seal (Delta-5 Cryptographic Tax Determination Sealing)', () => {
  const tenantId = 'tenant-corp-01';

  it('produces deterministic SHA-256 seal hashes', () => {
    const input = {
      tenantId,
      sequence: 1,
      calculationId: 'calc-001',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-100',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      timestamp: '2026-09-25T11:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const hash1 = computeTaxCalculationSealHash(input);
    const hash2 = computeTaxCalculationSealHash(input);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('mutates hash when tax calculation values are altered', () => {
    const base = {
      tenantId,
      sequence: 1,
      calculationId: 'calc-001',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-100',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      timestamp: '2026-09-25T11:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const baseHash = computeTaxCalculationSealHash(base);
    const modTax = computeTaxCalculationSealHash({ ...base, calculatedTaxMinor: 800 });
    const modRate = computeTaxCalculationSealHash({ ...base, appliedRateBasisPoints: 800 });
    const modSeq = computeTaxCalculationSealHash({ ...base, sequence: 2 });
    const modJurisdiction = computeTaxCalculationSealHash({ ...base, jurisdictionCode: 'US-NY' });

    expect(baseHash).not.toBe(modTax);
    expect(baseHash).not.toBe(modRate);
    expect(baseHash).not.toBe(modSeq);
    expect(baseHash).not.toBe(modJurisdiction);
  });

  it('verifies empty tax calculation list as VALID with GENESIS_SEAL_HASH', () => {
    const result = verifyTaxLedgerChain([]);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(TaxLedgerVerificationState.VALID);
    expect(result.totalRecords).toBe(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.headHash).toBe(GENESIS_SEAL_HASH);
  });

  it('detects UNSEALED state when records lack seal metadata', () => {
    const records: TaxCalculationSealRecord[] = [
      {
        id: 'calc-1',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-1',
        jurisdictionCode: 'US-CA',
        taxableAmountMinor: 10000,
        calculatedTaxMinor: 725,
        appliedRateBasisPoints: 725,
        calculationTimestamp: '2026-09-25T11:00:00.000Z',
        sealSequence: null,
        sealHash: null,
        previousSealHash: null,
      },
    ];

    const result = verifyTaxLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(TaxLedgerVerificationState.UNSEALED);
    expect(result.error).toContain('No cryptographic seals found');
  });

  it('verifies a valid multi-block tax calculation seal chain', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time2 = '2026-09-25T11:05:00.000Z';
    const time3 = '2026-09-25T11:10:00.000Z';

    const seal1 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 1,
      calculationId: 'calc-1',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-1',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal2 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 2,
      calculationId: 'calc-2',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-2',
      jurisdictionCode: 'US-NY',
      taxableAmountMinor: 20000,
      calculatedTaxMinor: 1775,
      appliedRateBasisPoints: 8875,
      timestamp: time2,
      previousSealHash: seal1,
    });

    const seal3 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 3,
      calculationId: 'calc-3',
      sourceModule: 'SPEND_MANAGEMENT',
      documentId: 'po-100',
      jurisdictionCode: 'US-TX',
      taxableAmountMinor: 150000,
      calculatedTaxMinor: 9375,
      appliedRateBasisPoints: 625,
      timestamp: time3,
      previousSealHash: seal2,
    });

    const records: TaxCalculationSealRecord[] = [
      {
        id: 'calc-1',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-1',
        jurisdictionCode: 'US-CA',
        taxableAmountMinor: 10000,
        calculatedTaxMinor: 725,
        appliedRateBasisPoints: 725,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'calc-2',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-2',
        jurisdictionCode: 'US-NY',
        taxableAmountMinor: 20000,
        calculatedTaxMinor: 1775,
        appliedRateBasisPoints: 8875,
        calculationTimestamp: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: seal1,
      },
      {
        id: 'calc-3',
        tenantId,
        sourceModule: 'SPEND_MANAGEMENT',
        documentId: 'po-100',
        jurisdictionCode: 'US-TX',
        taxableAmountMinor: 150000,
        calculatedTaxMinor: 9375,
        appliedRateBasisPoints: 625,
        calculationTimestamp: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal2,
      },
    ];

    const result = verifyTaxLedgerChain(records);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(TaxLedgerVerificationState.VALID);
    expect(result.verifiedCount).toBe(3);
    expect(result.headHash).toBe(seal3);
  });

  it('detects INCOMPLETE state when there is a sequence gap', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time3 = '2026-09-25T11:10:00.000Z';

    const seal1 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 1,
      calculationId: 'calc-1',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-1',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal3 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 3,
      calculationId: 'calc-3',
      sourceModule: 'SPEND_MANAGEMENT',
      documentId: 'po-100',
      jurisdictionCode: 'US-TX',
      taxableAmountMinor: 150000,
      calculatedTaxMinor: 9375,
      appliedRateBasisPoints: 625,
      timestamp: time3,
      previousSealHash: seal1,
    });

    const records: TaxCalculationSealRecord[] = [
      {
        id: 'calc-1',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-1',
        jurisdictionCode: 'US-CA',
        taxableAmountMinor: 10000,
        calculatedTaxMinor: 725,
        appliedRateBasisPoints: 725,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'calc-3',
        tenantId,
        sourceModule: 'SPEND_MANAGEMENT',
        documentId: 'po-100',
        jurisdictionCode: 'US-TX',
        taxableAmountMinor: 150000,
        calculatedTaxMinor: 9375,
        appliedRateBasisPoints: 625,
        calculationTimestamp: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal1,
      },
    ];

    const result = verifyTaxLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(TaxLedgerVerificationState.INCOMPLETE);
    expect(result.brokenIndex).toBe(1);
    expect(result.error).toContain('Ledger sequence gap');
  });

  it('detects INVALID state when tax calculation content has been tampered with', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const seal1 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 1,
      calculationId: 'calc-1',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-1',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const records: TaxCalculationSealRecord[] = [
      {
        id: 'calc-1',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-1',
        jurisdictionCode: 'US-CA',
        taxableAmountMinor: 10000,
        calculatedTaxMinor: 9999, // Tampered!
        appliedRateBasisPoints: 725,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
    ];

    const result = verifyTaxLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(TaxLedgerVerificationState.INVALID);
    expect(result.error).toContain('Tax calculation tampering detected');
  });

  it('detects INVALID state when previousSealHash is ruptured', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time2 = '2026-09-25T11:05:00.000Z';

    const seal1 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 1,
      calculationId: 'calc-1',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-1',
      jurisdictionCode: 'US-CA',
      taxableAmountMinor: 10000,
      calculatedTaxMinor: 725,
      appliedRateBasisPoints: 725,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const corruptPrevHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const seal2 = computeTaxCalculationSealHash({
      tenantId,
      sequence: 2,
      calculationId: 'calc-2',
      sourceModule: 'ACCOUNTS_RECEIVABLE',
      documentId: 'inv-2',
      jurisdictionCode: 'US-NY',
      taxableAmountMinor: 20000,
      calculatedTaxMinor: 1775,
      appliedRateBasisPoints: 8875,
      timestamp: time2,
      previousSealHash: corruptPrevHash,
    });

    const records: TaxCalculationSealRecord[] = [
      {
        id: 'calc-1',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-1',
        jurisdictionCode: 'US-CA',
        taxableAmountMinor: 10000,
        calculatedTaxMinor: 725,
        appliedRateBasisPoints: 725,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'calc-2',
        tenantId,
        sourceModule: 'ACCOUNTS_RECEIVABLE',
        documentId: 'inv-2',
        jurisdictionCode: 'US-NY',
        taxableAmountMinor: 20000,
        calculatedTaxMinor: 1775,
        appliedRateBasisPoints: 8875,
        calculationTimestamp: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: corruptPrevHash, // Mismatch!
      },
    ];

    const result = verifyTaxLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(TaxLedgerVerificationState.INVALID);
    expect(result.error).toContain('Ledger seal chain ruptured');
  });
});
