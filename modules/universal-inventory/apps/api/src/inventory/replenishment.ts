import { ExactDecimal } from '@gigalibs/contracts';

/** Min–max replenishment rule for one product at one warehouse (WI-OI-125 S3). */
export interface ReplenishRule {
  /** Reorder point: when available is at or below this, replenish. */
  readonly minQuantity: string;
  /** Target level to bring stock up to. */
  readonly maxQuantity: string;
  /** Order multiple (> 0); suggestions round up to a whole number of these. */
  readonly packSize: string;
}

export interface ReplenishmentSuggestion {
  readonly shouldReplenish: boolean;
  /** Quantity to order, a whole number of packs; '0.…' when no replenishment is needed. */
  readonly suggestedQuantity: string;
  /** Whole number of packs the suggestion covers. */
  readonly packs: string;
}

const ONE_SCALED = ExactDecimal.toScaledBigInt('1');
const NONE: ReplenishmentSuggestion = {
  shouldReplenish: false,
  suggestedQuantity: ExactDecimal.fromScaledBigInt(0n),
  packs: ExactDecimal.fromScaledBigInt(0n),
};

/**
 * Pure min–max replenishment. When available stock is at or below the reorder point, suggest the quantity
 * that brings it up to at least the max level, rounded UP to a whole number of packs. Exact decimal
 * arithmetic throughout; it never suggests a negative or non-pack quantity, and demands a settled rule.
 */
export function calculateReplenishment(availableQuantity: string, rule: ReplenishRule): ReplenishmentSuggestion {
  const { minQuantity, maxQuantity, packSize } = rule;
  if (ExactDecimal.isNegative(availableQuantity)) throw new Error('Available quantity cannot be negative.');
  if (ExactDecimal.isNegative(minQuantity)) throw new Error('Minimum quantity cannot be negative.');
  if (ExactDecimal.isLessThan(maxQuantity, minQuantity)) {
    throw new Error('Maximum must be greater than or equal to minimum.');
  }
  if (!ExactDecimal.isPositive(packSize)) throw new Error('Pack size must be positive.');

  // Above the reorder point → nothing to do.
  if (ExactDecimal.isGreaterThan(availableQuantity, minQuantity)) return NONE;

  const need = ExactDecimal.subtract(maxQuantity, availableQuantity);
  if (!ExactDecimal.isPositive(need)) return NONE; // min == max == available: nothing to order.

  // ceil(need / packSize) packs, then expand back to a quantity. Both operands are positive and share
  // the fixed decimal scale, so their scaled bigints divide to a unitless pack count.
  const needScaled = ExactDecimal.toScaledBigInt(need);
  const packScaled = ExactDecimal.toScaledBigInt(packSize);
  const packs = (needScaled + packScaled - 1n) / packScaled;
  return {
    shouldReplenish: true,
    suggestedQuantity: ExactDecimal.fromScaledBigInt(packs * packScaled),
    packs: ExactDecimal.fromScaledBigInt(packs * ONE_SCALED),
  };
}
