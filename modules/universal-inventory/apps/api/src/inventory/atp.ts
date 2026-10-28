import { ExactDecimal } from '@gigalibs/contracts';

/** Material Ledger ATP: available = onHand − reserved (never negative available). */
export function calculateAtp(onHandQuantity: string, reservedQuantity: string): {
  availableQuantity: string;
  sufficientFor: (requestedQuantity: string) => boolean;
} {
  if (ExactDecimal.isNegative(onHandQuantity) || ExactDecimal.isNegative(reservedQuantity)) {
    throw new Error('On-hand and reserved quantities cannot be negative.');
  }
  if (ExactDecimal.isGreaterThan(reservedQuantity, onHandQuantity)) {
    throw new Error('Reserved quantity exceeds on-hand; ledger must be reconciled.');
  }
  const availableQuantity = ExactDecimal.subtract(onHandQuantity, reservedQuantity);
  return {
    availableQuantity,
    sufficientFor: (requestedQuantity: string) =>
      !ExactDecimal.isNegative(requestedQuantity) &&
      ExactDecimal.isLessThanOrEqual(requestedQuantity, availableQuantity),
  };
}
