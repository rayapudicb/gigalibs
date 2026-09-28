import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContractsService } from './contracts.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('ContractsService (DS-01 Lifecycle & Compatibility)', () => {
  let contractsService: ContractsService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockDb = {
      query: vi.fn(),
      getClient: vi.fn().mockResolvedValue(mockClient),
    };

    contractsService = new ContractsService(mockDb as unknown as DatabaseService);
  });

  it('rejects requests missing tenantId', async () => {
    await expect(contractsService.getContracts('')).rejects.toThrow('tenantId is required');
    await expect(contractsService.getContractById('', 'dc-1')).rejects.toThrow('tenantId is required');
    await expect(contractsService.createContract('', {} as any)).rejects.toThrow('tenantId is required');
  });

  it('creates contract with initial 1.0.0 schema version inside transaction', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // query latest seal
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'dc-101', contract_code: 'TEST-CONTRACT', active_version: '1.0.0' }],
      }) // insert contract
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'ver-101', version: '1.0.0' }],
      }) // insert version
      .mockResolvedValueOnce({}) // insert audit
      .mockResolvedValueOnce({}); // COMMIT

    const result = await contractsService.createContract('tenant-corp-01', {
      contract_code: 'TEST-CONTRACT',
      name: 'Test Contract',
      domain: 'FINANCE',
      owner_team: 'Data Core',
      initial_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    });

    expect(result.id).toBe('dc-101');
    expect(result.active_version).toBe('1.0.0');
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('detects breaking changes when new mandatory properties are added to backward-compatible contracts', async () => {
    const existingContract = {
      id: 'dc-existing',
      contract_code: 'AR-INVOICE',
      active_version: '1.0.0',
      compatibility_mode: 'BACKWARD',
    };

    const prevVersion = {
      json_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['invoice_id'],
      },
    };

    // Mock lookups
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [existingContract] }) // get contract
      .mockResolvedValueOnce({ rowCount: 1, rows: [prevVersion] }); // get active version

    // Mock client transaction
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'ver-102', version: '2.0.0', is_breaking_change: true }],
      }) // insert version
      .mockResolvedValueOnce({}) // update active_version
      .mockResolvedValueOnce({}) // insert audit
      .mockResolvedValueOnce({}); // COMMIT

    const result = await contractsService.publishVersion('tenant-corp-01', 'dc-existing', {
      version: '2.0.0',
      json_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string' },
          amount: { type: 'number' },
          customer_tax_id: { type: 'string' }, // New required field!
        },
        required: ['invoice_id', 'customer_tax_id'],
      },
      change_summary: 'Require customer_tax_id on all incoming invoices',
    });

    expect(result.version).toBe('2.0.0');
    expect(result.is_breaking_change).toBe(true);

    // Verify insertVersion received is_breaking_change = true and annotated change summary
    const insertCall = mockClient.query.mock.calls.find((c: any[]) =>
      c[0].includes('INSERT INTO gigalibs_data_studio.contract_versions'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1][4]).toContain('[BREAKING: Added new mandatory field(s): customer_tax_id]');
    expect(insertCall[1][5]).toBe(true); // isBreakingChange
  });

  it('detects breaking changes when existing property types change', async () => {
    const existingContract = {
      id: 'dc-type-change',
      contract_code: 'ORDER-STREAM',
      active_version: '1.0.0',
      compatibility_mode: 'BACKWARD',
    };

    const prevVersion = {
      json_schema: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
          status_code: { type: 'integer' },
        },
      },
    };

    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [existingContract] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [prevVersion] });

    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ver-103', is_breaking_change: true }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await contractsService.publishVersion('tenant-corp-01', 'dc-type-change', {
      version: '1.1.0',
      json_schema: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
          status_code: { type: 'string' }, // Changed from integer to string!
        },
      },
      change_summary: 'Change status_code to string enum',
    });

    const insertCall = mockClient.query.mock.calls.find((c: any[]) =>
      c[0].includes('INSERT INTO gigalibs_data_studio.contract_versions'),
    );
    expect(insertCall[1][4]).toContain('type changed from integer to string');
    expect(insertCall[1][5]).toBe(true);
  });

  it('prevents deleting active contract version', async () => {
    mockDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'dc-1', contract_code: 'C-1', active_version: '1.0.0' }],
    });

    await expect(
      contractsService.deleteVersion('tenant-corp-01', 'dc-1', '1.0.0'),
    ).rejects.toThrow('Cannot delete active contract version');
  });

  it('prevents deleting version referenced by historical drift records', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'dc-1', contract_code: 'C-1', active_version: '2.0.0' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'drift-99' }],
      }); // found drift reference

    await expect(
      contractsService.deleteVersion('tenant-corp-01', 'dc-1', '1.0.0'),
    ).rejects.toThrow('historical drift records reference this contract');
  });

  it('deprecates contract with explicit reason', async () => {
    mockDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'dc-1', status: 'DEPRECATED', deprecation_reason: 'Replaced by V2' }],
    });

    const res = await contractsService.deprecateContract('tenant-corp-01', 'dc-1', 'Replaced by V2');
    expect(res.status).toBe('DEPRECATED');
    expect(res.deprecation_reason).toBe('Replaced by V2');
  });

  describe('verifyLedger (Delta-5 Cryptographic Continuity)', () => {
    it('rejects empty tenantId', async () => {
      await expect(contractsService.verifyLedger('')).rejects.toThrow('tenantId is required');
    });

    it('returns VALID when ledger has zero contracts', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const result = await contractsService.verifyLedger('tenant-corp-01');
      expect(result.valid).toBe(true);
      expect(result.state).toBe('VALID');
      expect(result.totalRecords).toBe(0);
    });

    it('returns UNSEALED when contracts lack seal_sequence or seal_hash', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'dc-1',
            tenant_id: 'tenant-corp-01',
            contract_code: 'UNSEALED-1',
            name: 'Unsealed Contract',
            domain: 'OPS',
            active_version: '1.0.0',
            created_at: new Date('2026-09-25T10:00:00Z'),
            seal_sequence: null,
            seal_hash: null,
            previous_seal_hash: null,
          },
        ],
      });
      const result = await contractsService.verifyLedger('tenant-corp-01');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('UNSEALED');
    });
  });
});
