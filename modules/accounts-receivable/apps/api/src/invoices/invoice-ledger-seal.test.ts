import { describe, expect, it } from 'vitest';
import {
  GENESIS_SEAL_HASH,
  LedgerVerificationState,
  computeInvoiceSealHash,
  verifyInvoiceLedgerChain,
  type InvoiceSealRecord,
} from './invoice-ledger-seal.js';

describe('invoice-ledger-seal', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  it('computes deterministic SHA-256 seal hashes', () => {
    const input = {
      tenantId,
      sequence: 1,
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 'INV-2026-0001',
      currency: 'USD',
      subtotalMinor: 10000,
      taxMinor: 1000,
      totalMinor: 11000,
      issuedAt: '2026-09-25T10:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const hash1 = computeInvoiceSealHash(input);
    const hash2 = computeInvoiceSealHash(input);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);

    // Tampering with totalMinor changes hash
    const tampered = computeInvoiceSealHash({ ...input, totalMinor: 11001 });
    expect(tampered).not.toBe(hash1);
  });

  it('verifies empty record sets as valid with genesis head', () => {
    const result = verifyInvoiceLedgerChain([]);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(LedgerVerificationState.VALID);
    expect(result.totalRecords).toBe(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.headHash).toBe(GENESIS_SEAL_HASH);
  });

  it('detects unsealed records (UNSEALED)', () => {
    const records: InvoiceSealRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId,
        invoiceNumber: 'INV-2026-0001',
        currency: 'USD',
        subtotalMinor: 1000,
        taxMinor: 100,
        totalMinor: 1100,
        issuedAt: '2026-09-25T10:00:00.000Z',
        sealSequence: null,
        sealHash: null,
        previousSealHash: null,
      },
    ];

    const result = verifyInvoiceLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(LedgerVerificationState.UNSEALED);
    expect(result.totalRecords).toBe(1);
    expect(result.verifiedCount).toBe(0);
  });

  it('validates a continuous and untampered ledger chain (VALID)', () => {
    const issuedAt1 = '2026-09-25T10:00:00.000Z';
    const hash1 = computeInvoiceSealHash({
      tenantId,
      sequence: 1,
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 'INV-2026-0001',
      currency: 'USD',
      subtotalMinor: 10000,
      taxMinor: 1000,
      totalMinor: 11000,
      issuedAt: issuedAt1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const issuedAt2 = '2026-09-25T11:00:00.000Z';
    const hash2 = computeInvoiceSealHash({
      tenantId,
      sequence: 2,
      invoiceId: '22222222-2222-4222-8222-222222222222',
      invoiceNumber: 'INV-2026-0002',
      currency: 'USD',
      subtotalMinor: 20000,
      taxMinor: 2000,
      totalMinor: 22000,
      issuedAt: issuedAt2,
      previousSealHash: hash1,
    });

    const issuedAt3 = '2026-09-25T12:00:00.000Z';
    const hash3 = computeInvoiceSealHash({
      tenantId,
      sequence: 3,
      invoiceId: '33333333-3333-4333-8333-333333333333',
      invoiceNumber: 'INV-2026-0003',
      currency: 'USD',
      subtotalMinor: 5000,
      taxMinor: 500,
      totalMinor: 5500,
      issuedAt: issuedAt3,
      previousSealHash: hash2,
    });

    const records: InvoiceSealRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId,
        invoiceNumber: 'INV-2026-0001',
        currency: 'USD',
        subtotalMinor: 10000,
        taxMinor: 1000,
        totalMinor: 11000,
        issuedAt: issuedAt1,
        sealSequence: 1,
        sealHash: hash1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        tenantId,
        invoiceNumber: 'INV-2026-0002',
        currency: 'USD',
        subtotalMinor: 20000,
        taxMinor: 2000,
        totalMinor: 22000,
        issuedAt: issuedAt2,
        sealSequence: 2,
        sealHash: hash2,
        previousSealHash: hash1,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        tenantId,
        invoiceNumber: 'INV-2026-0003',
        currency: 'USD',
        subtotalMinor: 5000,
        taxMinor: 500,
        totalMinor: 5500,
        issuedAt: issuedAt3,
        sealSequence: 3,
        sealHash: hash3,
        previousSealHash: hash2,
      },
    ];

    const result = verifyInvoiceLedgerChain(records);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(LedgerVerificationState.VALID);
    expect(result.totalRecords).toBe(3);
    expect(result.verifiedCount).toBe(3);
    expect(result.headHash).toBe(hash3);
  });

  it('detects ledger sequence gaps (INCOMPLETE)', () => {
    const issuedAt1 = '2026-09-25T10:00:00.000Z';
    const hash1 = computeInvoiceSealHash({
      tenantId,
      sequence: 1,
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 'INV-2026-0001',
      currency: 'USD',
      subtotalMinor: 10000,
      taxMinor: 1000,
      totalMinor: 11000,
      issuedAt: issuedAt1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const issuedAt3 = '2026-09-25T12:00:00.000Z';
    const hash3 = computeInvoiceSealHash({
      tenantId,
      sequence: 3,
      invoiceId: '33333333-3333-4333-8333-333333333333',
      invoiceNumber: 'INV-2026-0003',
      currency: 'USD',
      subtotalMinor: 5000,
      taxMinor: 500,
      totalMinor: 5500,
      issuedAt: issuedAt3,
      previousSealHash: hash1,
    });

    const records: InvoiceSealRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId,
        invoiceNumber: 'INV-2026-0001',
        currency: 'USD',
        subtotalMinor: 10000,
        taxMinor: 1000,
        totalMinor: 11000,
        issuedAt: issuedAt1,
        sealSequence: 1,
        sealHash: hash1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        tenantId,
        invoiceNumber: 'INV-2026-0003',
        currency: 'USD',
        subtotalMinor: 5000,
        taxMinor: 500,
        totalMinor: 5500,
        issuedAt: issuedAt3,
        sealSequence: 3,
        sealHash: hash3,
        previousSealHash: hash1,
      },
    ];

    const result = verifyInvoiceLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(LedgerVerificationState.INCOMPLETE);
    expect(result.brokenIndex).toBe(1);
    expect(result.error).toContain('Ledger sequence gap: expected 2, received 3');
  });

  it('detects tampering with invoice amount (INVALID)', () => {
    const issuedAt1 = '2026-09-25T10:00:00.000Z';
    const hash1 = computeInvoiceSealHash({
      tenantId,
      sequence: 1,
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 'INV-2026-0001',
      currency: 'USD',
      subtotalMinor: 10000,
      taxMinor: 1000,
      totalMinor: 11000,
      issuedAt: issuedAt1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const records: InvoiceSealRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId,
        invoiceNumber: 'INV-2026-0001',
        currency: 'USD',
        subtotalMinor: 10000,
        taxMinor: 1000,
        totalMinor: 99999, // Tampered!
        issuedAt: issuedAt1,
        sealSequence: 1,
        sealHash: hash1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
    ];

    const result = verifyInvoiceLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(LedgerVerificationState.INVALID);
    expect(result.brokenIndex).toBe(0);
    expect(result.error).toContain('Financial tampering detected');
  });

  it('detects ruptured previous seal hash linkage (INVALID)', () => {
    const issuedAt1 = '2026-09-25T10:00:00.000Z';
    const hash1 = computeInvoiceSealHash({
      tenantId,
      sequence: 1,
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 'INV-2026-0001',
      currency: 'USD',
      subtotalMinor: 10000,
      taxMinor: 1000,
      totalMinor: 11000,
      issuedAt: issuedAt1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const issuedAt2 = '2026-09-25T11:00:00.000Z';
    const fakePrevHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const hash2 = computeInvoiceSealHash({
      tenantId,
      sequence: 2,
      invoiceId: '22222222-2222-4222-8222-222222222222',
      invoiceNumber: 'INV-2026-0002',
      currency: 'USD',
      subtotalMinor: 20000,
      taxMinor: 2000,
      totalMinor: 22000,
      issuedAt: issuedAt2,
      previousSealHash: fakePrevHash,
    });

    const records: InvoiceSealRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId,
        invoiceNumber: 'INV-2026-0001',
        currency: 'USD',
        subtotalMinor: 10000,
        taxMinor: 1000,
        totalMinor: 11000,
        issuedAt: issuedAt1,
        sealSequence: 1,
        sealHash: hash1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        tenantId,
        invoiceNumber: 'INV-2026-0002',
        currency: 'USD',
        subtotalMinor: 20000,
        taxMinor: 2000,
        totalMinor: 22000,
        issuedAt: issuedAt2,
        sealSequence: 2,
        sealHash: hash2,
        previousSealHash: fakePrevHash, // Does not match hash1!
      },
    ];

    const result = verifyInvoiceLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(LedgerVerificationState.INVALID);
    expect(result.brokenIndex).toBe(1);
    expect(result.error).toContain('Ledger seal chain ruptured');
  });
});
