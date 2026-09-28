import { describe, it, expect } from 'vitest';
import {
  computeContractSealHash,
  verifyContractLedgerChain,
  GENESIS_SEAL_HASH,
  ContractLedgerVerificationState,
  type ContractSealRecord,
} from './contract-ledger-seal.js';

describe('contract-ledger-seal (Delta-5 Cryptographic Ledger Verification)', () => {
  const tenantId = 'tenant-corp-01';

  it('produces deterministic SHA-256 seal hashes', () => {
    const input = {
      tenantId,
      sequence: 1,
      contractId: 'dc-001',
      contractCode: 'GL-ORDER-EVENTS',
      name: 'Order Events Contract',
      domain: 'COMMERCE',
      activeVersion: '1.0.0',
      createdAt: '2026-09-25T10:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const hash1 = computeContractSealHash(input);
    const hash2 = computeContractSealHash(input);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('changes hash when any field is altered', () => {
    const base = {
      tenantId,
      sequence: 1,
      contractId: 'dc-001',
      contractCode: 'GL-ORDER-EVENTS',
      name: 'Order Events Contract',
      domain: 'COMMERCE',
      activeVersion: '1.0.0',
      createdAt: '2026-09-25T10:00:00.000Z',
      previousSealHash: GENESIS_SEAL_HASH,
    };

    const baseHash = computeContractSealHash(base);
    const modifiedName = computeContractSealHash({ ...base, name: 'Tampered Name' });
    const modifiedVersion = computeContractSealHash({ ...base, activeVersion: '1.0.1' });
    const modifiedSeq = computeContractSealHash({ ...base, sequence: 2 });

    expect(baseHash).not.toBe(modifiedName);
    expect(baseHash).not.toBe(modifiedVersion);
    expect(baseHash).not.toBe(modifiedSeq);
  });

  it('verifies empty contract list as VALID with GENESIS_SEAL_HASH', () => {
    const result = verifyContractLedgerChain([]);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(ContractLedgerVerificationState.VALID);
    expect(result.totalRecords).toBe(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.headHash).toBe(GENESIS_SEAL_HASH);
  });

  it('detects UNSEALED state when records lack seal metadata', () => {
    const records: ContractSealRecord[] = [
      {
        id: 'dc-1',
        tenantId,
        contractCode: 'GL-C1',
        name: 'Contract 1',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: '2026-09-25T10:00:00.000Z',
        sealSequence: null,
        sealHash: null,
        previousSealHash: null,
      },
    ];

    const result = verifyContractLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(ContractLedgerVerificationState.UNSEALED);
    expect(result.error).toContain('No cryptographic seals found');
  });

  it('verifies a valid multi-block seal chain', () => {
    const time1 = '2026-09-25T10:00:00.000Z';
    const time2 = '2026-09-25T10:05:00.000Z';
    const time3 = '2026-09-25T10:10:00.000Z';

    const seal1 = computeContractSealHash({
      tenantId,
      sequence: 1,
      contractId: 'dc-1',
      contractCode: 'GL-C1',
      name: 'Contract 1',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const seal2 = computeContractSealHash({
      tenantId,
      sequence: 2,
      contractId: 'dc-2',
      contractCode: 'GL-C2',
      name: 'Contract 2',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time2,
      previousSealHash: seal1,
    });

    const seal3 = computeContractSealHash({
      tenantId,
      sequence: 3,
      contractId: 'dc-3',
      contractCode: 'GL-C3',
      name: 'Contract 3',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time3,
      previousSealHash: seal2,
    });

    const records: ContractSealRecord[] = [
      {
        id: 'dc-1',
        tenantId,
        contractCode: 'GL-C1',
        name: 'Contract 1',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'dc-2',
        tenantId,
        contractCode: 'GL-C2',
        name: 'Contract 2',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: seal1,
      },
      {
        id: 'dc-3',
        tenantId,
        contractCode: 'GL-C3',
        name: 'Contract 3',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal2,
      },
    ];

    const result = verifyContractLedgerChain(records);
    expect(result.valid).toBe(true);
    expect(result.state).toBe(ContractLedgerVerificationState.VALID);
    expect(result.verifiedCount).toBe(3);
    expect(result.headHash).toBe(seal3);
  });

  it('detects INCOMPLETE state when there is a sequence gap', () => {
    const time1 = '2026-09-25T10:00:00.000Z';
    const time3 = '2026-09-25T10:10:00.000Z';

    const seal1 = computeContractSealHash({
      tenantId,
      sequence: 1,
      contractId: 'dc-1',
      contractCode: 'GL-C1',
      name: 'Contract 1',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    // Sequence 2 is missing, jumped directly to sequence 3
    const seal3 = computeContractSealHash({
      tenantId,
      sequence: 3,
      contractId: 'dc-3',
      contractCode: 'GL-C3',
      name: 'Contract 3',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time3,
      previousSealHash: seal1,
    });

    const records: ContractSealRecord[] = [
      {
        id: 'dc-1',
        tenantId,
        contractCode: 'GL-C1',
        name: 'Contract 1',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'dc-3',
        tenantId,
        contractCode: 'GL-C3',
        name: 'Contract 3',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time3,
        sealSequence: 3,
        sealHash: seal3,
        previousSealHash: seal1,
      },
    ];

    const result = verifyContractLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(ContractLedgerVerificationState.INCOMPLETE);
    expect(result.brokenIndex).toBe(1);
    expect(result.error).toContain('Ledger sequence gap');
  });

  it('detects INVALID state when record content has been tampered with', () => {
    const time1 = '2026-09-25T10:00:00.000Z';
    const seal1 = computeContractSealHash({
      tenantId,
      sequence: 1,
      contractId: 'dc-1',
      contractCode: 'GL-C1',
      name: 'Original Name',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const records: ContractSealRecord[] = [
      {
        id: 'dc-1',
        tenantId,
        contractCode: 'GL-C1',
        name: 'Tampered Name After Sealing', // Tampered!
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
    ];

    const result = verifyContractLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(ContractLedgerVerificationState.INVALID);
    expect(result.error).toContain('Contract tampering detected');
  });

  it('detects INVALID state when previousSealHash is broken', () => {
    const time1 = '2026-09-25T10:00:00.000Z';
    const time2 = '2026-09-25T10:05:00.000Z';

    const seal1 = computeContractSealHash({
      tenantId,
      sequence: 1,
      contractId: 'dc-1',
      contractCode: 'GL-C1',
      name: 'Contract 1',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time1,
      previousSealHash: GENESIS_SEAL_HASH,
    });

    const corruptPrevHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const seal2 = computeContractSealHash({
      tenantId,
      sequence: 2,
      contractId: 'dc-2',
      contractCode: 'GL-C2',
      name: 'Contract 2',
      domain: 'FINANCE',
      activeVersion: '1.0.0',
      createdAt: time2,
      previousSealHash: corruptPrevHash,
    });

    const records: ContractSealRecord[] = [
      {
        id: 'dc-1',
        tenantId,
        contractCode: 'GL-C1',
        name: 'Contract 1',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time1,
        sealSequence: 1,
        sealHash: seal1,
        previousSealHash: GENESIS_SEAL_HASH,
      },
      {
        id: 'dc-2',
        tenantId,
        contractCode: 'GL-C2',
        name: 'Contract 2',
        domain: 'FINANCE',
        activeVersion: '1.0.0',
        createdAt: time2,
        sealSequence: 2,
        sealHash: seal2,
        previousSealHash: corruptPrevHash, // Does not match seal1!
      },
    ];

    const result = verifyContractLedgerChain(records);
    expect(result.valid).toBe(false);
    expect(result.state).toBe(ContractLedgerVerificationState.INVALID);
    expect(result.error).toContain('Ledger seal chain ruptured');
  });
});
