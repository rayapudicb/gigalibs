import { ExactDecimal } from '@gigalibs/contracts';

/** WI-OI-126 S3: apply scrap percent to required quantity (pure). */
export function applyScrapFactor(requiredQuantity: string, scrapPercent: string): string {
  const pct = Number(scrapPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
    throw new Error('scrapPercent must be between 0 and 100.');
  }
  const factor = ExactDecimal.add('1', ExactDecimal.multiply(String(pct), '0.010000'));
  return ExactDecimal.multiply(requiredQuantity, factor);
}

/** Rolls standard unit costs across exploded lines. */
export function rollupMaterialCost(
  lines: readonly { productId: string; quantity: string; unitCostMinor: string }[],
): string {
  let total = 0n;
  for (const line of lines) {
    const qty = BigInt(ExactDecimal.toScaledBigInt(line.quantity));
    const unit = BigInt(line.unitCostMinor);
    total += (qty * unit) / 10_000_000_000n;
  }
  return total.toString();
}
