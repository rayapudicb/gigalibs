import { describe, expect, it } from 'vitest';
import {
  ConsolidationGroupV1Schema,
  ConsolidationEntityV1Schema,
  ConsolidationFxRateV1Schema,
  IntercompanyPairV1Schema,
  ConsolidationRunV1Schema,
  ConsolidationEliminationV1Schema,
  CreateConsolidationGroupInputV1Schema,
  ExecuteConsolidationRunInputV1Schema,
} from './consolidation.js';

describe('Consolidation Contracts', () => {
  const tenantId = 't-corp-01';

  it('validates ConsolidationGroupV1Schema correctly', () => {
    const validGroup = {
      id: '11111111-1111-4111-a111-111111111111',
      tenantId,
      code: 'GRP-GLOBAL',
      name: 'Global Consolidated Holding',
      description: 'Primary corporate consolidation group',
      reportingCurrency: 'USD',
      parentEntityId: '22222222-2222-4222-a222-222222222222',
      ctaGlAccountId: '33333333-3333-4333-a333-333333333333',
      nciGlAccountId: '44444444-4444-4444-a444-444444444444',
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'controller',
      updatedBy: null,
    };

    const parsed = ConsolidationGroupV1Schema.parse(validGroup);
    expect(parsed.code).toBe('GRP-GLOBAL');
    expect(parsed.reportingCurrency).toBe('USD');
    expect(parsed.isActive).toBe(true);
  });

  it('validates ConsolidationEntityV1Schema with ownership percentage', () => {
    const validEntity = {
      id: '55555555-5555-4555-a555-555555555555',
      tenantId,
      consolidationGroupId: '11111111-1111-4111-a111-111111111111',
      bookId: '66666666-6666-4666-a666-666666666666',
      ownershipPercentage: 80, // 80% majority owned
      consolidationMethod: 'FULL',
      isParent: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = ConsolidationEntityV1Schema.parse(validEntity);
    expect(parsed.ownershipPercentage).toBe(80);
    expect(parsed.consolidationMethod).toBe('FULL');
    expect(parsed.isParent).toBe(false);
  });

  it('validates ConsolidationFxRateV1Schema with scaled rates', () => {
    const validRate = {
      id: '77777777-7777-4777-a777-777777777777',
      tenantId,
      consolidationGroupId: '11111111-1111-4111-a111-111111111111',
      fiscalYearId: '88888888-8888-4888-a888-888888888888',
      fiscalPeriodId: '99999999-9999-4999-a999-999999999999',
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      closingRateScaled: '1300000', // 1.300000
      averageRateScaled: '1280000', // 1.280000
      historicalRateScaled: '1250000', // 1.250000
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = ConsolidationFxRateV1Schema.parse(validRate);
    expect(parsed.fromCurrency).toBe('GBP');
    expect(parsed.closingRateScaled).toBe('1300000');
    expect(parsed.averageRateScaled).toBe('1280000');
  });

  it('validates IntercompanyPairV1Schema', () => {
    const validPair = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      tenantId,
      consolidationGroupId: '11111111-1111-4111-a111-111111111111',
      code: 'IC-US-UK-TRADE',
      entityABookId: '22222222-2222-4222-a222-222222222222',
      entityAGlAccountId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', // Due from UK
      entityBBookId: '66666666-6666-4666-a666-666666666666',
      entityBGlAccountId: 'cccccccc-cccc-4ccc-accc-cccccccccccc', // Due to US
      pairType: 'BALANCE_SHEET',
      eliminationTarget: 'BILATERAL',
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = IntercompanyPairV1Schema.parse(validPair);
    expect(parsed.code).toBe('IC-US-UK-TRADE');
    expect(parsed.pairType).toBe('BALANCE_SHEET');
  });

  it('validates ConsolidationRunV1Schema and ConsolidationEliminationV1Schema', () => {
    const validRun = {
      id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      tenantId,
      consolidationGroupId: '11111111-1111-4111-a111-111111111111',
      runNumber: 'CRUN-2026-M09-001',
      fiscalYearId: '88888888-8888-4888-a888-888888888888',
      fiscalPeriodId: '99999999-9999-4999-a999-999999999999',
      status: 'ELIMINATED',
      totalSubsidiaryDebitMinor: '500000000',
      totalSubsidiaryCreditMinor: '500000000',
      totalEliminationDebitMinor: '25000000',
      totalEliminationCreditMinor: '25000000',
      totalCtaMinor: '1250000',
      totalConsolidatedDebitMinor: '475000000',
      totalConsolidatedCreditMinor: '475000000',
      executedBy: 'finance_lead',
      executedAt: new Date().toISOString(),
      sealedAt: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsedRun = ConsolidationRunV1Schema.parse(validRun);
    expect(parsedRun.status).toBe('ELIMINATED');
    expect(parsedRun.totalConsolidatedDebitMinor).toBe('475000000');

    const validElimination = {
      id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
      tenantId,
      consolidationRunId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      intercompanyPairId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      glJournalId: null,
      debitGlAccountId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
      creditGlAccountId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
      eliminationAmountMinor: '25000000',
      currencyCode: 'USD',
      discrepancyAmountMinor: '0',
      description: 'Eliminate bilateral trade receivables and payables between US and UK',
      createdAt: new Date().toISOString(),
    };

    const parsedElim = ConsolidationEliminationV1Schema.parse(validElimination);
    expect(parsedElim.eliminationAmountMinor).toBe('25000000');
  });

  it('validates input DTOs', () => {
    const input = {
      code: 'GRP-APAC',
      name: 'Asia Pacific Regional Group',
      reportingCurrency: 'USD',
      parentEntityId: '22222222-2222-4222-a222-222222222222',
      ctaGlAccountId: '33333333-3333-4333-a333-333333333333',
    };

    const parsed = CreateConsolidationGroupInputV1Schema.parse(input);
    expect(parsed.code).toBe('GRP-APAC');
    expect(parsed.reportingCurrency).toBe('USD');

    const runInput = {
      consolidationGroupId: '11111111-1111-4111-a111-111111111111',
      fiscalYearId: '88888888-8888-4888-a888-888888888888',
      fiscalPeriodId: '99999999-9999-4999-a999-999999999999',
      executedBy: 'lead_accountant',
    };

    const parsedRunInput = ExecuteConsolidationRunInputV1Schema.parse(runInput);
    expect(parsedRunInput.postEliminationJournals).toBe(true);
  });
});
