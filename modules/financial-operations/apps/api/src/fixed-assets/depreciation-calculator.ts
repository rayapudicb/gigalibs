export interface SchedulePeriodInput {
  periodId: string;
  periodNumber: number;
  scheduleDate: string;
}

export interface CalculatedScheduleLine {
  periodId: string;
  periodNumber: number;
  scheduleDate: string;
  depreciationAmountMinor: string;
  accumulatedDepreciationMinor: string;
  bookValueMinor: string;
}

export interface DepreciationCalculationParams {
  acquisitionCostMinor: string;
  salvageValueMinor: string;
  usefulLifeMonths: number;
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'SUM_OF_YEARS_DIGITS' | 'NO_DEPRECIATION';
  periods: SchedulePeriodInput[];
}

/**
 * Deterministic fixed asset depreciation schedule calculator.
 * All arithmetic strictly evaluates integer minor units (BigInt cents).
 * Absolutely zero floating-point math.
 */
export function calculateDepreciationSchedule(
  params: DepreciationCalculationParams,
): CalculatedScheduleLine[] {
  const {
    acquisitionCostMinor,
    salvageValueMinor,
    usefulLifeMonths,
    depreciationMethod,
    periods,
  } = params;

  const cost = BigInt(acquisitionCostMinor);
  const salvage = BigInt(salvageValueMinor);

  if (cost < 0n) {
    throw new Error('Acquisition cost must be non-negative');
  }
  if (salvage < 0n) {
    throw new Error('Salvage value must be non-negative');
  }
  if (salvage > cost) {
    throw new Error('Salvage value cannot exceed acquisition cost');
  }
  if (usefulLifeMonths < 0) {
    throw new Error('Useful life months must be non-negative');
  }

  const depreciableBasis = cost - salvage;

  if (depreciationMethod === 'NO_DEPRECIATION' || usefulLifeMonths === 0 || depreciableBasis === 0n) {
    return periods.map((p) => ({
      periodId: p.periodId,
      periodNumber: p.periodNumber,
      scheduleDate: p.scheduleDate,
      depreciationAmountMinor: '0',
      accumulatedDepreciationMinor: '0',
      bookValueMinor: cost.toString(),
    }));
  }

  if (depreciationMethod === 'STRAIGHT_LINE') {
    return calculateStraightLine(cost, salvage, depreciableBasis, usefulLifeMonths, periods);
  }

  if (depreciationMethod === 'DECLINING_BALANCE') {
    return calculateDecliningBalance(cost, salvage, usefulLifeMonths, periods);
  }

  // Fallback to straight line for other methods
  return calculateStraightLine(cost, salvage, depreciableBasis, usefulLifeMonths, periods);
}

function calculateStraightLine(
  cost: bigint,
  salvage: bigint,
  depreciableBasis: bigint,
  usefulLifeMonths: number,
  periods: SchedulePeriodInput[],
): CalculatedScheduleLine[] {
  const totalMonths = BigInt(usefulLifeMonths);
  const baseMonthlyAmount = depreciableBasis / totalMonths;
  const remainderCents = depreciableBasis % totalMonths;

  let currentAccumulated = 0n;
  const lines: CalculatedScheduleLine[] = [];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    let monthDepreciation = 0n;

    if (p.periodNumber <= usefulLifeMonths) {
      if (p.periodNumber === usefulLifeMonths) {
        // Last period absorbs remainder cents to guarantee exact equality with depreciableBasis
        monthDepreciation = baseMonthlyAmount + remainderCents;
      } else {
        monthDepreciation = baseMonthlyAmount;
      }
    } else {
      monthDepreciation = 0n;
    }

    currentAccumulated += monthDepreciation;
    const currentBookValue = cost - currentAccumulated;

    lines.push({
      periodId: p.periodId,
      periodNumber: p.periodNumber,
      scheduleDate: p.scheduleDate,
      depreciationAmountMinor: monthDepreciation.toString(),
      accumulatedDepreciationMinor: currentAccumulated.toString(),
      bookValueMinor: currentBookValue.toString(),
    });
  }

  return lines;
}

function calculateDecliningBalance(
  cost: bigint,
  salvage: bigint,
  usefulLifeMonths: number,
  periods: SchedulePeriodInput[],
): CalculatedScheduleLine[] {
  // 200% Double Declining Balance: Monthly rate = 2 / usefulLifeMonths
  const numerator = 2n;
  const denominator = BigInt(usefulLifeMonths);

  let currentBookValue = cost;
  let currentAccumulated = 0n;
  const lines: CalculatedScheduleLine[] = [];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    let monthDepreciation = 0n;

    if (p.periodNumber <= usefulLifeMonths && currentBookValue > salvage) {
      if (p.periodNumber === usefulLifeMonths) {
        // Final period brings book value exactly to salvage value
        monthDepreciation = currentBookValue - salvage;
      } else {
        // (CurrentBookValue * 2) / UsefulLifeMonths
        const rawMonthly = (currentBookValue * numerator) / denominator;
        const maxDepreciation = currentBookValue - salvage;
        monthDepreciation = rawMonthly > maxDepreciation ? maxDepreciation : rawMonthly;
      }
    } else {
      monthDepreciation = 0n;
    }

    currentAccumulated += monthDepreciation;
    currentBookValue = cost - currentAccumulated;

    lines.push({
      periodId: p.periodId,
      periodNumber: p.periodNumber,
      scheduleDate: p.scheduleDate,
      depreciationAmountMinor: monthDepreciation.toString(),
      accumulatedDepreciationMinor: currentAccumulated.toString(),
      bookValueMinor: currentBookValue.toString(),
    });
  }

  return lines;
}
