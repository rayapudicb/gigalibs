import { describe, expect, it } from 'vitest';
import {
  consumeFifoLayers,
  calculateMovingAverage,
  calculatePurchasePriceVariance,
  apportionLandedCost,
} from './costing-engine.js';

describe('Costing Engine Arithmetic Tests', () => {
  it('correctly consumes FIFO layers across multiple receipts', () => {
    const layers = [
      { id: 'layer-1', remainingQuantity: '50.000000', unitCostScaled: '20000000' }, // 50 @ $20.00 = $1,000.00
      { id: 'layer-2', remainingQuantity: '50.000000', unitCostScaled: '25000000' }, // 50 @ $25.00 = $1,250.00
    ];

    // Request 70 units: should consume 50 from layer-1 ($1,000.00) + 20 from layer-2 ($500.00) = $1,500.00
    const result = consumeFifoLayers(layers, '70.000000');
    expect(result.unfulfilledQuantity).toBe('0.000000');
    expect(result.consumptions).toHaveLength(2);

    expect(result.consumptions[0]?.costLayerId).toBe('layer-1');
    expect(result.consumptions[0]?.quantityConsumed).toBe('50.000000');
    expect(result.consumptions[0]?.costMinor).toBe('100000'); // $1,000.00

    expect(result.consumptions[1]?.costLayerId).toBe('layer-2');
    expect(result.consumptions[1]?.quantityConsumed).toBe('20.000000');
    expect(result.consumptions[1]?.costMinor).toBe('50000'); // $500.00

    expect(result.totalCogsMinor).toBe('150000'); // $1,500.00 total COGS
  });

  it('correctly calculates Moving Weighted Average on receipt', () => {
    // Current: 100 units @ $10.00 (10,000,000) = $1,000.00
    // Receipt: 50 units @ $16.00 (16,000,000) = $800.00
    // Total: 150 units, Value $1,800.00 => New Avg = $12.00 (12,000,000)
    const result = calculateMovingAverage(
      '100.000000',
      '10000000',
      '50.000000',
      '16000000',
    );
    expect(result.totalNewQuantity).toBe('150.000000');
    expect(result.newAvgCostScaled).toBe('12000000');
  });

  it('correctly calculates Purchase Price Variance (PPV) for Standard Costing', () => {
    // Standard cost: $50.00 (50,000,000). Actual PO price: $55.00 (55,000,000). Qty: 200 units.
    // Unfavorable variance: 200 * ($55 - $50) = $1,000.00 = 100,000 cents
    const result = calculatePurchasePriceVariance(
      '200.000000',
      '55000000',
      '50000000',
    );
    expect(result.isUnfavorable).toBe(true);
    expect(result.varianceMinor).toBe('100000');
  });

  it('apportions landed costs with exact penny conservation', () => {
    const targets = [
      { costLayerId: 'layer-a', productId: 'p-1', basisMetric: '100.000000', layerRemainingQuantity: '10.000000' },
      { costLayerId: 'layer-b', productId: 'p-2', basisMetric: '200.000000', layerRemainingQuantity: '20.000000' },
    ];

    // Total landed cost: $100.00 (10000 cents)
    // Line A (1/3): 3333 cents
    // Line B (2/3): 6667 cents (including 1 cent remainder allocation to largest line)
    const allocations = apportionLandedCost('10000', '20000000', targets);
    expect(allocations).toHaveLength(2);

    const sumMinor = BigInt(allocations[0]!.apportionedAmountMinor) + BigInt(allocations[1]!.apportionedAmountMinor);
    expect(sumMinor.toString()).toBe('10000'); // Exact penny conservation!
  });
});
