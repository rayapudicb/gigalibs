import { describe, expect, it } from 'vitest';
import {
  FixedAssetClassV1Schema,
  FixedAssetV1Schema,
  AssetDepreciationScheduleV1Schema,
  AssetDisposalV1Schema,
  CreateFixedAssetInputV1Schema,
} from './fixed-assets.js';

describe('Fixed Assets Contracts', () => {
  const tenantId = 't-corp-01';

  it('validates FixedAssetClassV1Schema correctly', () => {
    const validClass = {
      id: '11111111-1111-4111-a111-111111111111',
      tenantId,
      code: 'MACH-01',
      name: 'Manufacturing Machinery',
      description: 'Heavy industrial production equipment',
      depreciationMethod: 'STRAIGHT_LINE',
      defaultUsefulLifeMonths: 120,
      defaultSalvagePercentage: 10,
      assetGlAccountId: '22222222-2222-4222-a222-222222222222',
      depreciationExpenseGlAccountId: '33333333-3333-4333-a333-333333333333',
      accumulatedDepreciationGlAccountId: '44444444-4444-4444-a444-444444444444',
      disposalGainLossGlAccountId: '55555555-5555-4555-a555-555555555555',
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = FixedAssetClassV1Schema.parse(validClass);
    expect(parsed.code).toBe('MACH-01');
    expect(parsed.depreciationMethod).toBe('STRAIGHT_LINE');
    expect(parsed.defaultUsefulLifeMonths).toBe(120);
  });

  it('validates FixedAssetV1Schema with zero-float minor money', () => {
    const validAsset = {
      id: '66666666-6666-4666-a666-666666666666',
      tenantId,
      assetCode: 'ASSET-CNC-001',
      assetName: '5-Axis CNC Milling Center',
      description: 'Main workshop milling machine',
      assetClassId: '11111111-1111-4111-a111-111111111111',
      status: 'CAPITALIZED',
      acquisitionDate: '2026-01-15',
      capitalizationDate: '2026-01-15',
      currencyCode: 'USD',
      acquisitionCostMinor: '12000000', // $120,000.00
      salvageValueMinor: '1200000', // $12,000.00
      usefulLifeMonths: 60,
      depreciationMethod: 'STRAIGHT_LINE',
      convention: 'FULL_MONTH',
      currentBookValueMinor: '12000000',
      accumulatedDepreciationMinor: '0',
      physicalAssetRef: '77777777-7777-4777-a777-777777777777',
      assetTag: 'TAG-CNC-01',
      serialNumber: 'SN-987654321',
      orgUnitId: 'PLANT-NORTH',
      placeId: 'FACILITY-01',
      custodianPartyId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'operator',
      updatedBy: null,
    };

    const parsed = FixedAssetV1Schema.parse(validAsset);
    expect(parsed.assetCode).toBe('ASSET-CNC-001');
    expect(parsed.acquisitionCostMinor).toBe('12000000');
    expect(parsed.physicalAssetRef).toBe('77777777-7777-4777-a777-777777777777');
  });

  it('validates AssetDepreciationScheduleV1Schema', () => {
    const validSchedule = {
      id: '88888888-8888-4888-a888-888888888888',
      tenantId,
      assetId: '66666666-6666-4666-a666-666666666666',
      fiscalPeriodId: '99999999-9999-4999-a999-999999999999',
      periodNumber: 1,
      scheduleDate: '2026-01-31',
      depreciationAmountMinor: '180000', // $1,800.00
      accumulatedDepreciationMinor: '180000',
      bookValueMinor: '11820000',
      status: 'PROJECTED',
      journalEntryId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = AssetDepreciationScheduleV1Schema.parse(validSchedule);
    expect(parsed.periodNumber).toBe(1);
    expect(parsed.depreciationAmountMinor).toBe('180000');
  });

  it('validates AssetDisposalV1Schema with gain/loss computation', () => {
    const validDisposal = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      tenantId,
      assetId: '66666666-6666-4666-a666-666666666666',
      disposalDate: '2026-10-04',
      disposalType: 'SALE',
      proceedsAmountMinor: '2500000', // $25,000.00
      netBookValueMinor: '2000000', // $20,000.00
      gainLossAmountMinor: '500000', // $5,000.00 gain
      clearingBankAccountId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
      journalEntryId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
      notes: 'Sold machine to regional manufacturer',
      createdAt: new Date().toISOString(),
    };

    const parsed = AssetDisposalV1Schema.parse(validDisposal);
    expect(parsed.disposalType).toBe('SALE');
    expect(parsed.gainLossAmountMinor).toBe('500000');
  });

  it('validates input DTOs', () => {
    const input = {
      assetCode: 'LAPTOP-01',
      assetName: 'Engineer MacBook Pro 16',
      assetClassId: '11111111-1111-4111-a111-111111111111',
      acquisitionDate: '2026-02-01',
      acquisitionCostMinor: '349900',
    };

    const parsed = CreateFixedAssetInputV1Schema.parse(input);
    expect(parsed.currencyCode).toBe('USD');
    expect(parsed.salvageValueMinor).toBe('0');
    expect(parsed.convention).toBe('FULL_MONTH');
  });
});
