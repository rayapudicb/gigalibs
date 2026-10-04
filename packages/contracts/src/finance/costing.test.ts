import { describe, expect, it } from 'vitest';
import {
  CostProfileV1Schema,
  InventoryCostLayerV1Schema,
  CostLayerConsumptionV1Schema,
  LandedCostV1Schema,
  LandedCostAllocationLineV1Schema,
  InventoryRevaluationV1Schema,
  CreateCostProfileInputV1Schema,
  LANDED_COST_ALLOCATION_BASES,
} from './costing.js';
import { COSTING_METHODS } from './finance.js';


describe('Costing Contracts', () => {
  const tenantId = 't-cost-01';

  it('validates CostProfileV1Schema correctly', () => {
    const validProfile = {
      id: '11111111-1111-4111-a111-111111111111',
      tenantId,
      code: 'FIFO-DEFAULT',
      name: 'Default FIFO Cost Profile',
      description: 'First-in First-out perpetual inventory valuation',
      costingMethod: 'FIFO',
      inventoryGlAccountId: '22222222-2222-4222-a222-222222222222',
      grniGlAccountId: '33333333-3333-4333-a333-333333333333',
      cogsGlAccountId: '44444444-4444-4444-a444-444444444444',
      landedCostClearingGlAccountId: '55555555-5555-4555-a555-555555555555',
      purchasePriceVarianceGlAccountId: '66666666-6666-4666-a666-666666666666',
      scrapGlAccountId: '77777777-7777-4777-a777-777777777777',
      valuationLossGlAccountId: '88888888-8888-4888-a888-888888888888',
      standardUnitCostScaled: null,
      isDefault: true,
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = CostProfileV1Schema.parse(validProfile);
    expect(parsed.code).toBe('FIFO-DEFAULT');
    expect(parsed.costingMethod).toBe('FIFO');
    expect(parsed.isDefault).toBe(true);
  });

  it('validates InventoryCostLayerV1Schema with integer scaled unit cost', () => {
    const validLayer = {
      id: '99999999-9999-4999-a999-999999999999',
      tenantId,
      costProfileId: '11111111-1111-4111-a111-111111111111',
      productId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      warehouseId: 'WH-MAIN',
      receiptRef: 'REC-PO-2026-001',
      receiptDate: new Date().toISOString(),
      initialQuantity: '100',
      remainingQuantity: '100',
      unitCostScaled: '25000000', // $25.000000
      totalInitialCostMinor: '250000', // $2,500.00
      totalRemainingCostMinor: '250000',
      landedCostAddedMinor: '0',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = InventoryCostLayerV1Schema.parse(validLayer);
    expect(parsed.initialQuantity).toBe('100');
    expect(parsed.unitCostScaled).toBe('25000000');
    expect(parsed.totalInitialCostMinor).toBe('250000');
  });

  it('validates CostLayerConsumptionV1Schema for COGS extraction', () => {
    const validConsumption = {
      id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
      tenantId,
      costLayerId: '99999999-9999-4999-a999-999999999999',
      transactionRef: 'DISP-SO-2026-042',
      transactionType: 'CUSTOMER_SHIPMENT',
      quantityConsumed: '40',
      unitCostScaled: '25000000',
      costMinor: '100000', // $1,000.00 COGS
      consumedAt: new Date().toISOString(),
      glJournalId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
      createdAt: new Date().toISOString(),
    };

    const parsed = CostLayerConsumptionV1Schema.parse(validConsumption);
    expect(parsed.quantityConsumed).toBe('40');
    expect(parsed.costMinor).toBe('100000');
    expect(parsed.transactionType).toBe('CUSTOMER_SHIPMENT');
  });

  it('validates LandedCostV1Schema and allocation line', () => {
    const validVoucher = {
      id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      tenantId,
      voucherNumber: 'LCV-2026-M10-001',
      description: 'Inbound customs duty and marine freight',
      allocationBasis: 'VALUE',
      totalLandedCostMinor: '50000', // $500.00
      currencyCode: 'USD',
      status: 'ALLOCATED',
      glJournalId: null,
      postedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsedVoucher = LandedCostV1Schema.parse(validVoucher);
    expect(parsedVoucher.voucherNumber).toBe('LCV-2026-M10-001');
    expect(parsedVoucher.allocationBasis).toBe('VALUE');

    const validLine = {
      id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
      tenantId,
      landedCostId: validVoucher.id,
      costLayerId: '99999999-9999-4999-a999-999999999999',
      productId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      basisWeight: '250000', // weight metric or line value
      apportionedAmountMinor: '50000',
      adjustedUnitCostScaled: '30000000', // jumped from $25 to $30
      createdAt: new Date().toISOString(),
    };

    const parsedLine = LandedCostAllocationLineV1Schema.parse(validLine);
    expect(parsedLine.apportionedAmountMinor).toBe('50000');
    expect(parsedLine.adjustedUnitCostScaled).toBe('30000000');
  });

  it('validates InventoryRevaluationV1Schema for Lower of Cost or NRV impairment', () => {
    const validRevaluation = {
      id: 'ffffffff-ffff-4fff-afff-ffffffffffff',
      tenantId,
      productId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      warehouseId: 'WH-MAIN',
      revaluationDate: new Date().toISOString(),
      reason: 'LOWER_OF_COST_OR_NRV',
      previousUnitCostScaled: '30000000',
      newUnitCostScaled: '22000000', // written down by $8/unit
      quantity: '60',
      carryingValueDeltaMinor: '-48000', // -$480.00
      glJournalId: '12121212-1212-4212-a212-121212121212',
      createdAt: new Date().toISOString(),
    };

    const parsed = InventoryRevaluationV1Schema.parse(validRevaluation);
    expect(parsed.reason).toBe('LOWER_OF_COST_OR_NRV');
    expect(parsed.carryingValueDeltaMinor).toBe('-48000');
  });

  it('validates input DTOs and enums', () => {
    expect(COSTING_METHODS).toContain('FIFO');
    expect(COSTING_METHODS).toContain('AVERAGE');
    expect(COSTING_METHODS).toContain('STANDARD');

    expect(LANDED_COST_ALLOCATION_BASES).toContain('VALUE');
    expect(LANDED_COST_ALLOCATION_BASES).toContain('WEIGHT');
    expect(LANDED_COST_ALLOCATION_BASES).toContain('VOLUME');
    expect(LANDED_COST_ALLOCATION_BASES).toContain('QUANTITY');

    const createProfileInput = {
      code: 'AVCO-MAIN',
      name: 'Moving Weighted Average',
      costingMethod: 'AVERAGE',
      inventoryGlAccountId: '22222222-2222-4222-a222-222222222222',
      grniGlAccountId: '33333333-3333-4333-a333-333333333333',
      cogsGlAccountId: '44444444-4444-4444-a444-444444444444',
      landedCostClearingGlAccountId: '55555555-5555-4555-a555-555555555555',
      purchasePriceVarianceGlAccountId: '66666666-6666-4666-a666-666666666666',
      scrapGlAccountId: '77777777-7777-4777-a777-777777777777',
      valuationLossGlAccountId: '88888888-8888-4888-a888-888888888888',
      standardUnitCostScaled: null,
      isDefault: false,
    };

    const parsedInput = CreateCostProfileInputV1Schema.parse(createProfileInput);
    expect(parsedInput.costingMethod).toBe('AVERAGE');
  });
});
