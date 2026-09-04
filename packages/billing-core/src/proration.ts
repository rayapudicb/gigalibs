export interface ProrationResult {
  refundAmount: number;
  chargeAmount: number;
  netAmountDue: number;
}

export class ProrationCalculator {
  /**
   * Calculates prorated amounts when switching plans mid-billing cycle.
   */
  static calculate(
    oldPlanPrice: number,
    newPlanPrice: number,
    daysRemainingInPeriod: number,
    totalDaysInPeriod: number,
  ): ProrationResult {
    const fraction = Math.max(0, Math.min(1, daysRemainingInPeriod / totalDaysInPeriod));

    const refundAmount = Math.round(oldPlanPrice * fraction);
    const chargeAmount = Math.round(newPlanPrice * fraction);
    const netAmountDue = Math.max(0, chargeAmount - refundAmount);

    return {
      refundAmount,
      chargeAmount,
      netAmountDue,
    };
  }
}
