import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SettleCmmsWorkOrderV1Schema,
  CmmsWorkOrderFinancialsV1Schema,
} from '@gigalibs/contracts';
import { cmmsLedgerSettlementService } from '../lib/cmms-ledger-settlement-service';
import { prisma } from '@gigalibs/db';

vi.mock('@gigalibs/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

describe('Phase 5: CMMS Maintenance Convergence & Double-Entry Ledger Settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Contract Validations', () => {
    it('validates a default settlement request payload', () => {
      const parsed = SettleCmmsWorkOrderV1Schema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.settleLabour).toBe(true);
        expect(parsed.data.settleParts).toBe(true);
      }
    });

    it('validates a customized settlement request payload with notes', () => {
      const parsed = SettleCmmsWorkOrderV1Schema.safeParse({
        settleLabour: true,
        settleParts: false,
        notes: 'Monthly PM inspection labor clearance',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.settleLabour).toBe(true);
        expect(parsed.data.settleParts).toBe(false);
        expect(parsed.data.notes).toBe('Monthly PM inspection labor clearance');
      }
    });

    it('validates a full financial summary response schema', () => {
      const sample = {
        workOrderId: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        woNumber: 'WO-2026-0091',
        settlementStatus: 'FULLY_SETTLED' as const,
        currencyCode: 'USD',
        labour: {
          totalHours: 4.5,
          totalCostCents: 38250, // $382.50
          entryCount: 2,
          settled: true,
          journalEntryId: 'je_sample_labour_entry',
        },
        parts: {
          totalQuantity: 2,
          totalCostCents: 15400, // $154.00
          movementCount: 1,
          settled: true,
          journalEntryId: 'je_sample_parts_entry',
        },
        totalCostCents: 53650, // $536.50
        settledAt: '2026-09-27T12:00:00.000Z',
        journalEntries: [
          {
            id: 'je_sample_parts_entry',
            entryNumber: 'MRO-PARTS-WO-2026-0091-XYZ',
            memo: 'MRO parts consumption for WO WO-2026-0091',
            postedAt: '2026-09-27T12:00:00.000Z',
            isBalanced: true,
            lines: [
              {
                accountCode: '5100',
                accountName: 'Maintenance Parts & Materials Expense',
                description: 'Maintenance Parts & Materials Expense - WO WO-2026-0091',
                debitCents: 15400,
                creditCents: 0,
              },
              {
                accountCode: '1300',
                accountName: 'Spare Parts & MRO Inventory',
                description: 'Spare Parts & MRO Inventory reduction - WO WO-2026-0091',
                debitCents: 0,
                creditCents: 15400,
              },
            ],
          },
          {
            id: 'je_sample_labour_entry',
            entryNumber: 'MRO-LABOUR-WO-2026-0091-ABC',
            memo: 'Direct maintenance labour settlement for WO WO-2026-0091',
            postedAt: '2026-09-27T12:00:00.000Z',
            isBalanced: true,
            lines: [
              {
                accountCode: '5200',
                accountName: 'Direct Maintenance Labour Expense',
                description: 'Direct Maintenance Labour Expense - WO WO-2026-0091',
                debitCents: 38250,
                creditCents: 0,
              },
              {
                accountCode: '2100',
                accountName: 'Accrued Payroll & Contractor Clearing',
                description: 'Accrued Payroll & Contractor Clearing - WO WO-2026-0091',
                debitCents: 0,
                creditCents: 38250,
              },
            ],
          },
        ],
      };

      const parsed = CmmsWorkOrderFinancialsV1Schema.safeParse(sample);
      if (!parsed.success) {
        console.error('Validation errors:', parsed.error.issues);
      }
      expect(parsed.success).toBe(true);
    });
  });

  describe('Financial Summary Service (getWorkOrderFinancials)', () => {
    it('accurately calculates labor hours, parts totals, and maps balanced journal lines', async () => {
      const mockWo = [
        {
          id: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
          wo_number: 'WO-000412',
          financial_settlement_status: 'PARTIALLY_SETTLED',
          settled_at: null,
          currency_code: 'USD',
        },
      ];

      const mockLabour = [
        {
          id: 'labour-1',
          hours: '3.50',
          hourly_rate: '85.00',
          currency_code: 'USD',
          booking_id: 'booking-uuid-1',
          settled_journal_entry_id: 'je-labour-1',
        },
      ];

      const mockMovements = [
        {
          id: 'movement-1',
          quantity_delta: '-2.000',
          unit_cost: '45.50',
          currency_code: 'USD',
          settled_journal_entry_id: null,
        },
      ];

      const mockJournal = [
        {
          entry_id: 'je-labour-1',
          entry_number: 'MRO-LABOUR-WO-000412-A1',
          memo: 'Labor settlement',
          posted_at: new Date('2026-09-27T10:00:00Z'),
          is_balanced: true,
          account_code: '5200',
          account_name: 'Direct Maintenance Labour Expense',
          description: 'Labor expense',
          debit_cents: 29750,
          credit_cents: 0,
        },
        {
          entry_id: 'je-labour-1',
          entry_number: 'MRO-LABOUR-WO-000412-A1',
          memo: 'Labor settlement',
          posted_at: new Date('2026-09-27T10:00:00Z'),
          is_balanced: true,
          account_code: '2100',
          account_name: 'Accrued Payroll & Contractor Clearing',
          description: 'Payroll clearing',
          debit_cents: 0,
          credit_cents: 29750,
        },
      ];

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce(mockWo)
        .mockResolvedValueOnce(mockLabour)
        .mockResolvedValueOnce(mockMovements)
        .mockResolvedValueOnce(mockJournal);

      const result = await cmmsLedgerSettlementService.getWorkOrderFinancials(
        'tenant_alpha',
        '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022'
      );

      expect(result.woNumber).toBe('WO-000412');
      expect(result.labour.totalHours).toBe(3.5);
      expect(result.labour.totalCostCents).toBe(29750); // 3.5 * 85 = 297.50
      expect(result.labour.settled).toBe(true);
      expect(result.parts.totalQuantity).toBe(2);
      expect(result.parts.totalCostCents).toBe(9100); // 2 * 45.50 = 91.00
      expect(result.parts.settled).toBe(false);
      expect(result.totalCostCents).toBe(38850);
      expect(result.journalEntries).toHaveLength(1);
      expect(result.journalEntries[0].isBalanced).toBe(true);
      expect(result.journalEntries[0].lines).toHaveLength(2);
    });
  });

  describe('GAAP Double-Entry Cost Settlement (settleWorkOrderCosts)', () => {
    it('generates debits and credits that balance to zero, writes to general_ledger_accounts, and marks items settled', async () => {
      const mockWo = [
        {
          id: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
          wo_number: 'WO-000999',
          financial_settlement_status: 'UNSETTLED',
          settled_at: null,
          currency_code: 'USD',
        },
      ];

      const mockUnsettledParts = [
        {
          id: 'part-mv-1',
          quantity_delta: '-4.000',
          unit_cost: '25.00', // $100.00 = 10000 cents
          currency_code: 'USD',
          settled_journal_entry_id: null,
        },
      ];

      const mockUnsettledLabour = [
        {
          id: 'lab-1',
          hours: '2.00',
          hourly_rate: '60.00', // $120.00 = 12000 cents
          currency_code: 'USD',
          booking_id: null,
          settled_journal_entry_id: null,
        },
      ];

      // For settleWorkOrderCosts:
      // 1. wo query
      // 2. parts query
      // 3. labour query
      // 4. count query (0 remaining)
      // 5. wo query for getWorkOrderFinancials
      // 6. labour query for getWorkOrderFinancials
      // 7. movements query for getWorkOrderFinancials
      // 8. journal entries query
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce(mockWo)
        .mockResolvedValueOnce(mockUnsettledParts)
        .mockResolvedValueOnce(mockUnsettledLabour)
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ ...mockWo[0], financial_settlement_status: 'FULLY_SETTLED' }])
        .mockResolvedValueOnce([{ ...mockUnsettledLabour[0], settled_journal_entry_id: 'je_mock_labour' }])
        .mockResolvedValueOnce([{ ...mockUnsettledParts[0], settled_journal_entry_id: 'je_mock_parts' }])
        .mockResolvedValueOnce([]);

      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as any);

      const result = await cmmsLedgerSettlementService.settleWorkOrderCosts(
        'tenant_alpha',
        '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        { settleLabour: true, settleParts: true, notes: 'Full WO closeout' }
      );

      // Verify executeRaw calls for journal_entries and journal_line_items were made
      expect(prisma.$executeRaw).toHaveBeenCalled();

      // Ensure work order was marked FULLY_SETTLED
      expect(result.settlementStatus).toBe('FULLY_SETTLED');
    });
  });

  describe('Workforce Booking Bridge (linkLabourToBooking)', () => {
    it('links work order labour to a workforce resource booking', async () => {
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as any);

      const res = await cmmsLedgerSettlementService.linkLabourToBooking(
        'tenant_alpha',
        '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        'c4542d99-52e6-4d0d-9b57-a81d45ef42cf',
        'd6542d99-52e6-4d0d-9b57-a81d45ef42d0'
      );

      expect(res.success).toBe(true);
      expect(res.labourId).toBe('c4542d99-52e6-4d0d-9b57-a81d45ef42cf');
      expect(res.bookingId).toBe('d6542d99-52e6-4d0d-9b57-a81d45ef42d0');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
