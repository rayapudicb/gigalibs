import type { LandedCostAllocationBasis } from './costing.js';

/** Receipt line inputs used to derive allocation weights (Module 5 / WI-OI-127). */
export interface LandedCostReceiptLineInput {
  quantity: string;
  /** Line extension in minor currency units (e.g. cents). */
  valueMinor: string;
  weightKg: string;
  volumeM3: string;
}

/**
 * Maps the voucher allocation basis to a non-negative metric per receipt line.
 * Pure — safe for exhaustive unit tests (Qty / Value / Weight / Volume).
 */
export function landedCostBasisMetric(
  basis: LandedCostAllocationBasis,
  line: LandedCostReceiptLineInput,
): string {
  switch (basis) {
    case 'QUANTITY':
      return line.quantity;
    case 'VALUE':
      return line.valueMinor;
    case 'WEIGHT':
      return line.weightKg;
    case 'VOLUME':
      return line.volumeM3;
    default: {
      const _exhaustive: never = basis;
      return _exhaustive;
    }
  }
}
