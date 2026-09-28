import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LineageService } from './lineage.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('LineageService (DS-05 Dynamic Tenant Lineage DAG)', () => {
  let lineageService: LineageService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    lineageService = new LineageService(mockDb as unknown as DatabaseService);
  });

  it('rejects requests missing tenantId', async () => {
    await expect(lineageService.getLineageGraph('')).rejects.toThrow('tenantId is required');
  });

  it('returns empty graph for empty tenant with zero synthetic nodes or edges', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // contracts
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // mappings

    const result = await lineageService.getLineageGraph('tenant-empty');
    expect(result.success).toBe(true);
    expect(result.tenant_id).toBe('tenant-empty');
    expect(result.nodes.upstream_sources).toHaveLength(0);
    expect(result.nodes.data_contracts).toHaveLength(0);
    expect(result.nodes.field_mappings).toHaveLength(0);
    expect(result.nodes.downstream_modules).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('builds dynamic lineage graph from tenant-committed contracts and field mappings', async () => {
    const mockContracts = [
      {
        id: 'dc-1',
        contract_code: 'CONTRACT-AR-INVOICE',
        name: 'AR Invoices',
        domain: 'FINANCE',
        active_version: '1.0.0',
        compatibility_mode: 'BACKWARD',
        status: 'PUBLISHED',
      },
    ];

    const mockMappings = [
      {
        id: 'map-sf',
        mapping_name: 'Salesforce Closed Won to AR',
        source_system: 'SALESFORCE_CRM',
        contract_code: 'CONTRACT-AR-INVOICE',
        currency_normalization: true,
        target_currency: 'USD',
        domain: 'FINANCE',
      },
    ];

    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: mockContracts })
      .mockResolvedValueOnce({ rowCount: 1, rows: mockMappings });

    const result = await lineageService.getLineageGraph('tenant-corp-01');

    expect(result.success).toBe(true);
    expect(result.nodes.upstream_sources).toHaveLength(1);
    expect(result.nodes.upstream_sources[0].name).toBe('SALESFORCE_CRM');
    expect(result.nodes.data_contracts).toHaveLength(1);
    expect(result.nodes.downstream_modules).toHaveLength(1);
    expect(result.nodes.downstream_modules[0].id).toBe('mod-ar');

    // Edges: source -> contract, contract -> mod-ar
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].from).toBe('src-salesforce-crm');
    expect(result.edges[0].to).toBe('CONTRACT-AR-INVOICE');
    expect(result.edges[1].from).toBe('CONTRACT-AR-INVOICE');
    expect(result.edges[1].to).toBe('mod-ar');
  });
});
