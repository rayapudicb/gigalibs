import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DecisionTablesService, DecisionTableDto } from './decision-tables.service.js';

describe('DecisionTablesService (RL-02: Decision tables and deterministic semantics)', () => {
  let service: DecisionTablesService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      withTenantTransaction: vi.fn(async (tenantId: string, op: any) => {
        return op(mockClient);
      }),
    };
    service = new DecisionTablesService(mockDb);
  });

  describe('Cell Pattern Matching', () => {
    it('matches wildcard and ANY values', () => {
      expect(service.matchCell('ANY_VALUE', 'ANY')).toBe(true);
      expect(service.matchCell(12345, '*')).toBe(true);
      expect(service.matchCell(null, 'ANY')).toBe(true);
    });

    it('matches range expressions [min..max]', () => {
      expect(service.matchCell(25, '[10..50]')).toBe(true);
      expect(service.matchCell(10, '[10..50]')).toBe(true);
      expect(service.matchCell(50, '[10..50]')).toBe(true);
      expect(service.matchCell(5, '[10..50]')).toBe(false);
      expect(service.matchCell(55, '[10..50]')).toBe(false);
      expect(service.matchCell(NaN, '[10..50]')).toBe(false);
    });

    it('matches set expressions IN and brackets', () => {
      expect(service.matchCell('US', "IN ('US', 'CA', 'MX')")).toBe(true);
      expect(service.matchCell('DE', "IN ('US', 'CA', 'MX')")).toBe(false);
      expect(service.matchCell('GOLD', '[GOLD, PLATINUM]')).toBe(true);
      expect(service.matchCell('BRONZE', '[GOLD, PLATINUM]')).toBe(false);
    });

    it('matches comparison prefixes (>=, <=, >, <, !=)', () => {
      expect(service.matchCell(100, '>= 100')).toBe(true);
      expect(service.matchCell(99, '>= 100')).toBe(false);
      expect(service.matchCell(50, '<= 50')).toBe(true);
      expect(service.matchCell(51, '<= 50')).toBe(false);
      expect(service.matchCell(100, '> 50')).toBe(true);
      expect(service.matchCell(50, '> 50')).toBe(false);
      expect(service.matchCell('ACTIVE', '!= SUSPENDED')).toBe(true);
      expect(service.matchCell('SUSPENDED', '!= SUSPENDED')).toBe(false);
    });
  });

  describe('Hit Policy Evaluation Semantics (RL-02)', () => {
    const sampleTable = {
      id: 'tbl-discount-01',
      tenant_id: 'tenant-100',
      table_code: 'DISCOUNT_MATRIX',
      name: 'Customer Tier Discount Matrix',
      domain: 'PRICING',
      hit_policy: 'FIRST',
      columns: {
        inputs: [
          { name: 'tier', type: 'STRING' },
          { name: 'order_volume', type: 'NUMBER' },
        ],
        outputs: [
          { name: 'discount_pct', type: 'NUMBER' },
          { name: 'approval_required', type: 'BOOLEAN' },
        ],
      },
      rows: [
        { tier: 'PLATINUM', order_volume: '>= 10000', discount_pct: 25, approval_required: true },
        { tier: 'PLATINUM', order_volume: 'ANY', discount_pct: 15, approval_required: false },
        { tier: 'GOLD', order_volume: '>= 5000', discount_pct: 10, approval_required: false },
        { tier: 'GOLD', order_volume: 'ANY', discount_pct: 5, approval_required: false },
      ],
    };

    it('evaluates FIRST hit policy and stops at the highest priority matching row', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...sampleTable, hit_policy: 'FIRST' }] })
        .mockResolvedValueOnce({ rows: [] }); // insert log

      const result = await service.evaluateTable(
        'tenant-100',
        'DISCOUNT_MATRIX',
        { tier: 'PLATINUM', order_volume: 15000 }
      );

      expect(result.success).toBe(true);
      expect(result.matched).toBe(true);
      expect(result.matched_rows_count).toBe(1);
      expect(result.outputs).toEqual({ discount_pct: 25, approval_required: true });
    });

    it('evaluates UNIQUE hit policy and returns outputs when exactly one row matches', async () => {
      const uniqueTable = {
        ...sampleTable,
        hit_policy: 'UNIQUE',
        rows: [
          { tier: 'PLATINUM', order_volume: '>= 10000', discount_pct: 25, approval_required: true },
          { tier: 'GOLD', order_volume: 'ANY', discount_pct: 5, approval_required: false },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [uniqueTable] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.evaluateTable(
        'tenant-100',
        'DISCOUNT_MATRIX',
        { tier: 'GOLD', order_volume: 200 }
      );

      expect(result.success).toBe(true);
      expect(result.matched).toBe(true);
      expect(result.matched_rows_count).toBe(1);
      expect(result.outputs).toEqual({ discount_pct: 5, approval_required: false });
    });

    it('throws BadRequestException under UNIQUE hit policy when multiple rows conflict', async () => {
      const conflictingTable = {
        ...sampleTable,
        hit_policy: 'UNIQUE',
        rows: [
          { tier: 'PLATINUM', order_volume: '>= 1000', discount_pct: 20, approval_required: true },
          { tier: 'PLATINUM', order_volume: '>= 5000', discount_pct: 25, approval_required: true },
        ],
      };

      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [conflictingTable] });

      await expect(
        service.evaluateTable('tenant-100', 'DISCOUNT_MATRIX', { tier: 'PLATINUM', order_volume: 8000 })
      ).rejects.toThrow(/UNIQUE hit policy encountered conflict: multiple rows/);
    });

    it('evaluates COLLECT hit policy and aggregates all matching rows into an array of outputs', async () => {
      const collectTable = {
        ...sampleTable,
        hit_policy: 'COLLECT',
        rows: [
          { tier: 'PLATINUM', order_volume: 'ANY', discount_pct: 10, approval_required: false },
          { tier: 'ANY', order_volume: '>= 10000', discount_pct: 5, approval_required: false },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [collectTable] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.evaluateTable(
        'tenant-100',
        'DISCOUNT_MATRIX',
        { tier: 'PLATINUM', order_volume: 12000 }
      );

      expect(result.success).toBe(true);
      expect(result.matched).toBe(true);
      expect(result.matched_rows_count).toBe(2);
      expect(Array.isArray(result.outputs)).toBe(true);
      expect(result.outputs).toHaveLength(2);
      expect(result.outputs).toEqual([
        { discount_pct: 10, approval_required: false },
        { discount_pct: 5, approval_required: false },
      ]);
    });

    it('rejects unsupported hit policy with explicit error', async () => {
      const badTable = {
        ...sampleTable,
        hit_policy: 'RULE_ORDER_WEIGHTED',
      };

      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [badTable] });

      await expect(
        service.evaluateTable('tenant-100', 'DISCOUNT_MATRIX', { tier: 'PLATINUM' })
      ).rejects.toThrow(/Unsupported hit policy 'RULE_ORDER_WEIGHTED'/);
    });
  });
});
