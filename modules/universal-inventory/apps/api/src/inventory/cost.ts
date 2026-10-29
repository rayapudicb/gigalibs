import { ExactDecimal } from '@gigalibs/contracts';

/** Moving-average unit cost from prior on-hand and incoming receipt (Material Ledger S4). */
export function computeMovingAverageUnitCostMinor(
  priorOnHandQuantity: string,
  priorAverageUnitCostMinor: string,
  incomingQuantity: string,
  incomingUnitCostMinor: string,
): string {
  const priorQty = ExactDecimal.toScaledBigInt(priorOnHandQuantity);
  const incomingQty = ExactDecimal.toScaledBigInt(incomingQuantity);
  if (incomingQty <= 0n) {
    return priorAverageUnitCostMinor;
  }
  if (priorQty <= 0n) {
    return incomingUnitCostMinor;
  }
  const priorCost = BigInt(priorAverageUnitCostMinor);
  const incomingCost = BigInt(incomingUnitCostMinor);
  const numerator = priorCost * priorQty + incomingCost * incomingQty;
  const denominator = priorQty + incomingQty;
  return (numerator / denominator).toString();
}
