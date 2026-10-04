/**
 * Deterministic Inventory Costing & Landed Cost Arithmetic Engine
 * Conforms to IAS 2 / ASC 330 with zero floating-point math:
 * - Integer minor units for monetary amounts (cents)
 * - Scaled BigInt ($10^6$) for unit costs and quantities
 * - Exact cent conservation on landed cost apportionment
 */

const SCALE = 1_000_000n; // 6 decimal places for unit costs

/** Converts decimal string e.g. "12.3456" to scaled BigInt with 6 decimals */
export function toScaledBigInt(decimalStr: string): bigint {
  const parts = decimalStr.trim().split('.');
  const whole = BigInt(parts[0] || '0');
  let fractionStr = parts[1] || '';
  if (fractionStr.length > 6) {
    fractionStr = fractionStr.slice(0, 6);
  } else {
    fractionStr = fractionStr.padEnd(6, '0');
  }
  const sign = decimalStr.startsWith('-') ? -1n : 1n;
  const fraction = BigInt(fractionStr);
  return whole >= 0n ? whole * SCALE + fraction : whole * SCALE - fraction;
}

/** Converts scaled BigInt back to 6-decimal string */
export function fromScaledBigInt(scaled: bigint): string {
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const whole = abs / SCALE;
  const fraction = abs % SCALE;
  const fractionStr = fraction.toString().padStart(6, '0');
  return `${isNegative ? '-' : ''}${whole}.${fractionStr}`;
}

export interface FifoLayer {
  id: string;
  remainingQuantity: string;
  unitCostScaled: string; // e.g. "25000000" = $25.000000
}

export interface LayerConsumptionResult {
  costLayerId: string;
  quantityConsumed: string;
  unitCostScaled: string;
  costMinor: string;
}

export interface FifoConsumptionResult {
  consumptions: LayerConsumptionResult[];
  unfulfilledQuantity: string;
  totalCogsMinor: string;
}

/**
 * Consumes FIFO inventory cost layers in strict chronological order.
 * Calculates exact COGS minor units per layer and total.
 */
export function consumeFifoLayers(
  layers: FifoLayer[],
  requestedQuantityStr: string,
): FifoConsumptionResult {
  let requestedScaled = toScaledBigInt(requestedQuantityStr);
  const consumptions: LayerConsumptionResult[] = [];
  let totalCogsMinor = 0n;

  for (const layer of layers) {
    if (requestedScaled <= 0n) break;

    const layerRemainingScaled = toScaledBigInt(layer.remainingQuantity);
    if (layerRemainingScaled <= 0n) continue;

    const consumeScaled =
      requestedScaled <= layerRemainingScaled ? requestedScaled : layerRemainingScaled;
    const unitCostScaled = BigInt(layer.unitCostScaled);

    // Minor cost = (Quantity * UnitCostScaled) / (SCALE * 10,000) for standard 2 decimal cents
    // Here: UnitCostScaled is scaled by 1,000,000 (representing dollars, so $25 = 25,000,000)
    // To get cents: (QuantityScaled * UnitCostScaled) / (SCALE * 10,000)
    // QuantityScaled has 10^6, UnitCostScaled has 10^6 => product has 10^12.
    // 1 dollar = 100 cents. So Cents = Dollars * 100 = (Product / 10^12) * 100 = Product / 10^10.
    const layerCostMinor = (consumeScaled * unitCostScaled) / 10_000_000_000n;

    consumptions.push({
      costLayerId: layer.id,
      quantityConsumed: fromScaledBigInt(consumeScaled),
      unitCostScaled: layer.unitCostScaled,
      costMinor: layerCostMinor.toString(),
    });

    totalCogsMinor += layerCostMinor;
    requestedScaled -= consumeScaled;
  }

  return {
    consumptions,
    unfulfilledQuantity: fromScaledBigInt(requestedScaled),
    totalCogsMinor: totalCogsMinor.toString(),
  };
}

/**
 * Recomputes Moving Weighted Average unit cost upon receipt.
 * Average = (CurrentQty * CurrentCost + ReceiptQty * ReceiptCost) / (CurrentQty + ReceiptQty)
 */
export function calculateMovingAverage(
  currentQuantityStr: string,
  currentAvgCostScaledStr: string,
  receiptQuantityStr: string,
  receiptCostScaledStr: string,
): { newAvgCostScaled: string; totalNewQuantity: string } {
  const currentQtyScaled = toScaledBigInt(currentQuantityStr);
  const currentCostScaled = BigInt(currentAvgCostScaledStr);
  const receiptQtyScaled = toScaledBigInt(receiptQuantityStr);
  const receiptCostScaled = BigInt(receiptCostScaledStr);

  const totalQtyScaled = currentQtyScaled + receiptQtyScaled;
  if (totalQtyScaled <= 0n) {
    return { newAvgCostScaled: '0', totalNewQuantity: '0.000000' };
  }

  const currentValueProduct = currentQtyScaled * currentCostScaled;
  const receiptValueProduct = receiptQtyScaled * receiptCostScaled;
  const newAvgCostScaled = (currentValueProduct + receiptValueProduct) / totalQtyScaled;

  return {
    newAvgCostScaled: newAvgCostScaled.toString(),
    totalNewQuantity: fromScaledBigInt(totalQtyScaled),
  };
}

/**
 * Calculates Purchase Price Variance (PPV) for Standard Costing:
 * PPV = Quantity * (ActualCost - StandardCost)
 * Positive PPV = Unfavorable (debit expense); Negative PPV = Favorable (credit variance)
 */
export function calculatePurchasePriceVariance(
  receiptQuantityStr: string,
  actualUnitCostScaledStr: string,
  standardUnitCostScaledStr: string,
): { varianceMinor: string; isUnfavorable: boolean } {
  const qtyScaled = toScaledBigInt(receiptQuantityStr);
  const actualScaled = BigInt(actualUnitCostScaledStr);
  const standardScaled = BigInt(standardUnitCostScaledStr);

  const deltaScaled = actualScaled - standardScaled;
  // Variance cents = (qtyScaled * deltaScaled) / 10^10
  const varianceMinor = (qtyScaled * deltaScaled) / 10_000_000_000n;

  return {
    varianceMinor: varianceMinor.toString(),
    isUnfavorable: varianceMinor > 0n,
  };
}

export interface LandedCostTarget {
  costLayerId: string;
  productId: string;
  basisMetric: string; // e.g. receipt line value minor, or weight in kg
  layerRemainingQuantity: string;
}

export interface LandedCostApportionmentResult {
  costLayerId: string;
  productId: string;
  apportionedAmountMinor: string;
  adjustedUnitCostScaled: string;
}

/**
 * Apportions total landed cost minor across receipt lines with exact cent conservation.
 * Any rounding fractional cents are assigned to the largest line.
 */
export function apportionLandedCost(
  totalLandedCostMinorStr: string,
  currentUnitCostScaledStr: string,
  targets: LandedCostTarget[],
): LandedCostApportionmentResult[] {
  const totalLandedCost = BigInt(totalLandedCostMinorStr);
  if (targets.length === 0 || totalLandedCost <= 0n) return [];

  const metrics = targets.map((t) => toScaledBigInt(t.basisMetric));
  const totalMetric = metrics.reduce((acc, m) => acc + m, 0n);
  if (totalMetric <= 0n) {
    throw new Error('Total allocation basis metric must be greater than zero');
  }

  let allocatedSum = 0n;
  const results: LandedCostApportionmentResult[] = [];
  let largestIdx = 0;
  let largestMetric = 0n;

  for (let i = 0; i < targets.length; i++) {
    const metric = metrics[i]!;
    if (metric > largestMetric) {
      largestMetric = metric;
      largestIdx = i;
    }
    const apportioned = (totalLandedCost * metric) / totalMetric;
    allocatedSum += apportioned;

    // Additional unit cost scaled: (apportioned cents * 10^10) / remainingQtyScaled
    const layerRemainingScaled = toScaledBigInt(targets[i]!.layerRemainingQuantity);
    const addedUnitCostScaled =
      layerRemainingScaled > 0n ? (apportioned * 10_000_000_000n) / layerRemainingScaled : 0n;
    const currentCostScaled = BigInt(currentUnitCostScaledStr);

    results.push({
      costLayerId: targets[i]!.costLayerId,
      productId: targets[i]!.productId,
      apportionedAmountMinor: apportioned.toString(),
      adjustedUnitCostScaled: (currentCostScaled + addedUnitCostScaled).toString(),
    });
  }

  // Exact cent conservation check: assign any rounding remainder to the largest line
  const remainder = totalLandedCost - allocatedSum;
  if (remainder !== 0n && results[largestIdx]) {
    const adjustedAmount = BigInt(results[largestIdx]!.apportionedAmountMinor) + remainder;
    results[largestIdx]!.apportionedAmountMinor = adjustedAmount.toString();
    const layerRemainingScaled = toScaledBigInt(targets[largestIdx]!.layerRemainingQuantity);
    const addedUnitCostScaled =
      layerRemainingScaled > 0n ? (adjustedAmount * 10_000_000_000n) / layerRemainingScaled : 0n;
    const currentCostScaled = BigInt(currentUnitCostScaledStr);
    results[largestIdx]!.adjustedUnitCostScaled = (currentCostScaled + addedUnitCostScaled).toString();
  }

  return results;
}
