import { describe, it, expect } from 'vitest';
import {
  BUDGET_TYPES,
  BUDGET_REVISION_STATUSES,
  BUDGET_CONTROL_ACTIONS,
  COMMITMENT_TYPES,
  BudgetStructureV1Schema,
  BudgetRevisionV1Schema,
  BudgetLineV1Schema,
  BudgetCommitmentV1Schema,
  BudgetCheckResultV1Schema,
  BudgetVarianceReportV1Schema,
} from './budgeting.js';

describe('Budgeting & Commitment Control Contracts (WI-OI-117)', () => {
  it('validates budget enums', () => {
    expect(BUDGET_TYPES).toContain('OPERATING_OPEX');
    expect(BUDGET_TYPES).toContain('CAPITAL_CAPEX');
    expect(BUDGET_REVISION_STATUSES).toContain('DRAFT');
    expect(BUDGET_REVISION_STATUSES).toContain('ACTIVE');
    expect(BUDGET_CONTROL_ACTIONS).toContain('HARD_STOP');
    expect(BUDGET_CONTROL_ACTIONS).toContain('ADVISORY_WARN');
    expect(COMMITMENT_TYPES).toContain('ENCUMBRANCE');
  });

  it('validates BudgetStructureV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-acme',
      code: 'BDG-OPEX-2026',
      name: '2026 Operating Budget',
      description: 'Annual corporate operating budget',
      budgetType: 'OPERATING_OPEX',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      controlAction: 'HARD_STOP',
      allowOverspendThresholdPct: 5,
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'controller-1',
      updatedBy: 'controller-1',
    };
    expect(BudgetStructureV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates BudgetRevisionV1Schema with maker-checker fields', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000002',
      tenantId: 'tenant-acme',
      budgetStructureId: 'a0000000-0000-4000-8000-000000000001',
      revisionNumber: 1,
      fiscalYearId: 'c0000000-0000-4000-8000-000000000001',
      status: 'ACTIVE',
      totalAllocatedMinor: '120000000', // $1,200,000.00
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      notes: 'Approved Board budget',
      submittedAt: new Date().toISOString(),
      submittedBy: 'analyst-1',
      approvedAt: new Date().toISOString(),
      approvedBy: 'cfo-1',
      activatedAt: new Date().toISOString(),
      activatedBy: 'controller-1',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(BudgetRevisionV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates BudgetLineV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000003',
      tenantId: 'tenant-acme',
      budgetRevisionId: 'a0000000-0000-4000-8000-000000000002',
      fiscalPeriodId: 'd0000000-0000-4000-8000-000000000001',
      accountId: 'e0000000-0000-4000-8000-000000000001',
      costCenterId: 'CC-ENG-01',
      projectCode: 'PRJ-ALPHA',
      allocatedAmountMinor: '10000000', // $100,000.00
      revisedAmountMinor: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(BudgetLineV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates BudgetCommitmentV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000004',
      tenantId: 'tenant-acme',
      budgetLineId: 'a0000000-0000-4000-8000-000000000003',
      sourceDocumentType: 'PURCHASE_ORDER',
      sourceDocumentId: 'po-1001',
      documentNumber: 'PO-2026-001',
      commitmentType: 'ENCUMBRANCE',
      amountMinor: '2500000', // $25,000.00
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(BudgetCommitmentV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates BudgetCheckResultV1Schema and VarianceReport', () => {
    const checkResult = {
      isAllowed: true,
      budgetLineId: 'a0000000-0000-4000-8000-000000000003',
      allocatedAmountMinor: '10000000',
      actualAmountMinor: '4000000',
      encumberedAmountMinor: '2500000',
      availableAmountMinor: '3500000',
      requestedAmountMinor: '1000000',
      resultingAvailableMinor: '2500000',
      controlAction: 'HARD_STOP',
      toleranceThresholdPct: 5,
      message: 'Spend request within authorized budget allocation',
    };
    expect(BudgetCheckResultV1Schema.safeParse(checkResult).success).toBe(true);

    const report = {
      budgetRevisionId: 'a0000000-0000-4000-8000-000000000002',
      fiscalYearId: 'c0000000-0000-4000-8000-000000000001',
      totalAllocatedMinor: '10000000',
      totalEncumberedMinor: '2500000',
      totalActualMinor: '4000000',
      totalAvailableMinor: '3500000',
      netVarianceMinor: '3500000',
      overallBurnRatePct: 65,
      lines: [
        {
          budgetLineId: 'a0000000-0000-4000-8000-000000000003',
          accountId: 'e0000000-0000-4000-8000-000000000001',
          costCenterId: 'CC-ENG-01',
          fiscalPeriodId: 'd0000000-0000-4000-8000-000000000001',
          allocatedMinor: '10000000',
          encumberedMinor: '2500000',
          actualMinor: '4000000',
          availableMinor: '3500000',
          varianceMinor: '3500000',
          burnRatePct: 65,
          isOverBudget: false,
        },
      ],
    };
    expect(BudgetVarianceReportV1Schema.safeParse(report).success).toBe(true);
  });
});
