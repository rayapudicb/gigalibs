import { describe, it, expect } from 'vitest';
import {
  computeConversionSealHash,
  verifyConversionLedgerChain,
  GENESIS_SEAL_HASH,
  CurrencyLedgerVerificationState,
  type ConversionSealRecord,
} from './conversion-ledger-seal.js';

describe('conversion-ledger-seal (Delta-5 Cryptographic FX Conversion Sealing)', () => {
  const tenantId = 'tenant-corp-01';

  it('produces deterministic SHA-256 seal hashes', () => {
    const input = {
      tenantId,
      sequence: 1,
      conversionId: 'cl-001',
      sourceModule: 'AR',
      documentId: 'inv-100',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      sourceAmountMinor: 10000,
      convertedAmountMinor: 10850,
      appliedRateMicros: 1085000,
      timestamp: '2026-09-25T11:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const hash1 = computeConversionSealHash(input);
    const hash2 = computeConversionSealHash(input);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('mutates hash when conversion values are altered', () => {
    const base = {
      tenantId,
      sequence: 1,
      conversionId: 'cl-001',
      sourceModule: 'AR',
      documentId: 'inv-100',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      sourceAmountMinor: 10000,
      convertedAmountMinor: 10850,
      appliedRateMicros: 1085000,
      timestamp: '2026-09-25T11:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const baseHash = computeConversionSealHash(base);
    const modAmount = computeConversionSealHash({ ...base, convertedAmountMinor: 10860 });
    const modRate = computeConversionSealHash({ ...base, appliedRateMicros: 1086000 });
    const modSeq = computeConversionSealHash({ ...base, sequence: 2 });

    expect(baseHash).not.toBe(modAmount);
    expect(baseHash).not.toBe(modRate);
    expect(baseHash).not.toBe(modSeq);
  });

  it('verifies empty conversion list as VALID with GENESIS_SEAL_HASH', () => {
    const result = verifyConversionLedgerChain([]);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(CurrencyLedgerVerificationState.VALID);
    expect(result.totalRecords).toBe(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.headHash).toBe(GENESIS_SEAL_HASH);
  });

  it('detects UNSEALED state when records lack seal metadata', () => {
    const records: ConversionSealRecord[] = [
      {
        id: 'cl-1',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-1',
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        sourceAmountMinor: 1000,
        convertedAmountMinor: 1085,
        appliedRateMicros: 1085000,
        calculationTimestamp: '2026-09-25T11:00:00.000Z',
        sealSequence: null,
        sealHash: null,
        previousSealHash: null,
      },
    ];

    const result = verifyConversionLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(CurrencyLedgerVerificationState.UNSEALED);
    expect(result.error).toContain('No cryptographic seals found');
  });

  it('verifies a valid multi-block conversion seal chain', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time2 = '2026-09-25T11:05:00.000Z';
    const time3 = '2026-09-25T11:10:00.000Z';

    const seal1 = computeConversionSealHash({
      tenantId,
      sequence: 1,
      conversionId: 'cl-1',
      sourceModule: 'AR',
      documentId: 'inv-1',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      sourceAmountMinor: 1000,
      convertedAmountMinor: 1085,
      appliedRateMicros: 1085000,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal2 = computeConversionSealHash({
      tenantId,
      sequence: 2,
      conversionId: 'cl-2',
      sourceModule: 'AR',
      documentId: 'inv-2',
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      sourceAmountMinor: 2000,
      convertedAmountMinor: 2600,
      appliedRateMicros: 1300000,
      timestamp: time2,
      previousSealHash: seal1,
    });

    const seal3 = computeConversionSealHash({
      tenantId,
      sequence: 3,
      conversionId: 'cl-3',
      sourceModule: 'SPEND',
      documentId: 'po-100',
      fromCurrency: 'JPY',
      toCurrency: 'USD',
      sourceAmountMinor: 150000,
      convertedAmountMinor: 1000,
      appliedRateMicros: 6666,
      timestamp: time3,
      previousSealHash: seal2,
    });

    const records: ConversionSealRecord[] = [
      {
        id: 'cl-1',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-1',
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        sourceAmountMinor: 1000,
        convertedAmountMinor: 1085,
        appliedRateMicros: 1085000,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'cl-2',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-2',
        fromCurrency: 'GBP',
        toCurrency: 'USD',
        sourceAmountMinor: 2000,
        convertedAmountMinor: 2600,
        appliedRateMicros: 1300000,
        calculationTimestamp: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: seal1,
      },
      {
        id: 'cl-3',
        tenantId,
        sourceModule: 'SPEND',
        documentId: 'po-100',
        fromCurrency: 'JPY',
        toCurrency: 'USD',
        sourceAmountMinor: 150000,
        convertedAmountMinor: 1000,
        appliedRateMicros: 6666,
        calculationTimestamp: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal2,
      },
    ];

    const result = verifyConversionLedgerChain(records);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(CurrencyLedgerVerificationState.VALID);
    expect(result.verifiedCount).toBe(3);
    expect(result.headHash).toBe(seal3);
  });

  it('detects INCOMPLETE state when there is a sequence gap', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time3 = '2026-09-25T11:10:00.000Z';

    const seal1 = computeConversionSealHash({
      tenantId,
      sequence: 1,
      conversionId: 'cl-1',
      sourceModule: 'AR',
      documentId: 'inv-1',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      sourceAmountMinor: 1000,
      convertedAmountMinor: 1085,
      appliedRateMicros: 1085000,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal3 = computeConversionSealHash({
      tenantId,
      sequence: 3,
      conversionId: 'cl-3',
      sourceModule: 'SPEND',
      documentId: 'po-100',
      fromCurrency: 'JPY',
      toCurrency: 'USD',
      sourceAmountMinor: 150000,
      convertedAmountMinor: 1000,
      appliedRateMicros: 6666,
      timestamp: time3,
      previousSealHash: seal1,
    });

    const records: ConversionSealRecord[] = [
      {
        id: 'cl-1',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-1',
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        sourceAmountMinor: 1000,
        convertedAmountMinor: 1085,
        appliedRateMicros: 1085000,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'cl-3',
        tenantId,
        sourceModule: 'SPEND',
        documentId: 'po-100',
        fromCurrency: 'JPY',
        toCurrency: 'USD',
        sourceAmountMinor: 150000,
        convertedAmountMinor: 1000,
        appliedRateMicros: 6666,
        calculationTimestamp: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal1,
      },
    ];

    const result = verifyConversionLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(CurrencyLedgerVerificationState.INCOMPLETE);
    expect(result.brokenIndex).toBe(1);
    expect(result.error).toContain('Ledger sequence gap');
  });

  it('detects INVALID state when conversion content has been tampered with', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const seal1 = computeConversionSealHash({
      tenantId,
      sequence: 1,
      conversionId: 'cl-1',
      sourceModule: 'AR',
      documentId: 'inv-1',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      sourceAmountMinor: 1000,
      convertedAmountMinor: 1085,
      appliedRateMicros: 1085000,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const records: ConversionSealRecord[] = [
      {
        id: 'cl-1',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-1',
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        sourceAmountMinor: 1000,
        convertedAmountMinor: 9999, // Tampered!
        appliedRateMicros: 1085000,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
    ];

    const result = verifyConversionLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(CurrencyLedgerVerificationState.INVALID);
    expect(result.error).toContain('Conversion tampering detected');
  });

  it('detects INVALID state when previousSealHash is ruptured', () => {
    const time1 = '2026-09-25T11:00:00.000Z';
    const time2 = '2026-09-25T11:05:00.000Z';

    const seal1 = computeConversionSealHash({
      tenantId,
      sequence: 1,
      conversionId: 'cl-1',
      sourceModule: 'AR',
      documentId: 'inv-1',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      sourceAmountMinor: 1000,
      convertedAmountMinor: 1085,
      appliedRateMicros: 1085000,
      timestamp: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const corruptPrevHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const seal2 = computeConversionSealHash({
      tenantId,
      sequence: 2,
      conversionId: 'cl-2',
      sourceModule: 'AR',
      documentId: 'inv-2',
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      sourceAmountMinor: 2000,
      convertedAmountMinor: 2600,
      appliedRateMicros: 1300000,
      timestamp: time2,
      previousSealHash: corruptPrevHash,
    });

    const records: ConversionSealRecord[] = [
      {
        id: 'cl-1',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-1',
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        sourceAmountMinor: 1000,
        convertedAmountMinor: 1085,
        appliedRateMicros: 1085000,
        calculationTimestamp: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'cl-2',
        tenantId,
        sourceModule: 'AR',
        documentId: 'inv-2',
        fromCurrency: 'GBP',
        toCurrency: 'USD',
        sourceAmountMinor: 2000,
        convertedAmountMinor: 2600,
        appliedRateMicros: 1300000,
        calculationTimestamp: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: corruptPrevHash, // Mismatch!
      },
    ];

    const result = verifyConversionLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(CurrencyLedgerVerificationState.INVALID);
    expect(result.error).toContain('Ledger seal chain ruptured');
  });
});
