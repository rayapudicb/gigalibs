/**
 * @gigalibs/spend-core
 *
 * Enterprise Headless Spend, Project Budgeting & Expense Management Engine
 * Provides pure mathematical algorithms, state machine transitions,
 * budget burn-rate alerts, subscription prediction, and project P&L calculations.
 *
 * @module
 */

export type BudgetPeriod = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'PROJECT_LIFETIME';
export type BudgetStatus = 'ACTIVE' | 'EXCEEDED' | 'CLOSED';
export type ExpenseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REIMBURSED' | 'REJECTED';
export type BillingPassThrough = 'BILLABLE' | 'NON_BILLABLE';
export type BudgetAlertLevel = 'NORMAL' | 'WARN_THRESHOLD' | 'EXCEEDED_CEILING';

export interface BudgetDefinition {
  id: string;
  name: string;
  code: string;
  totalLimitCents: number;
  warnThresholdPct: number;
  spentCents: number;
  currency: string;
  status: BudgetStatus;
}

export interface BudgetHealthResult {
  spentPercentage: number;
  remainingCents: number;
  alertLevel: BudgetAlertLevel;
  isOverBudget: boolean;
  varianceCents: number;
}

/**
 * 1. Budget & Burn-Rate Calculator
 */
export class BudgetBurnRateCalculator {
  static evaluate(budget: BudgetDefinition): BudgetHealthResult {
    const limit = Math.max(1, budget.totalLimitCents);
    const spent = Math.max(0, budget.spentCents);
    const spentPercentage = Math.round((spent / limit) * 10000) / 100;
    const remainingCents = Math.max(0, limit - spent);
    const varianceCents = limit - spent;
    const isOverBudget = spent > limit;

    let alertLevel: BudgetAlertLevel = 'NORMAL';
    if (isOverBudget) {
      alertLevel = 'EXCEEDED_CEILING';
    } else if (spentPercentage >= budget.warnThresholdPct) {
      alertLevel = 'WARN_THRESHOLD';
    }

    return {
      spentPercentage,
      remainingCents,
      alertLevel,
      isOverBudget,
      varianceCents,
    };
  }

  static calculateCategoryBurn(categories: Array<{ limitCents: number; spentCents: number; categoryName: string }>) {
    return categories.map((cat) => {
      const limit = Math.max(1, cat.limitCents);
      const spent = Math.max(0, cat.spentCents);
      const utilizationPct = Math.round((spent / limit) * 10000) / 100;
      return {
        categoryName: cat.categoryName,
        limitCents: cat.limitCents,
        spentCents: cat.spentCents,
        remainingCents: Math.max(0, cat.limitCents - cat.spentCents),
        utilizationPct,
        isOverLimit: spent > limit,
      };
    });
  }
}

/**
 * 2. Expense Approval Workflow & Pass-Through Engine
 */
export class ExpenseApprovalWorkflowEngine {
  private static readonly VALID_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
    DRAFT: ['SUBMITTED', 'REJECTED'],
    SUBMITTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['REIMBURSED', 'REJECTED'],
    REIMBURSED: [], // Terminal settled state
    REJECTED: ['SUBMITTED'], // Can be resubmitted with corrections
  };

  static canTransition(from: ExpenseStatus, to: ExpenseStatus): boolean {
    return this.VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: ExpenseStatus, to: ExpenseStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid expense claim transition from "${from}" to "${to}".`);
    }
  }

  /**
   * Calculates billable amount to invoice clients when passThrough is enabled.
   */
  static calculateBillableClientPrice(amountCents: number, markupPercent: number): number {
    if (markupPercent <= 0) return amountCents;
    return Math.round(amountCents * (1 + markupPercent / 100));
  }
}

/**
 * 3. Split Transaction Validator
 */
export interface SplitItemInput {
  category: string;
  amountCents: number;
  description?: string;
}

export class SplitTransactionCalculator {
  static validateAndAllocate(totalReceiptAmountCents: number, items: SplitItemInput[]): { isValid: boolean; allocatedTotalCents: number; discrepancyCents: number } {
    const allocatedTotalCents = items.reduce((sum, it) => sum + it.amountCents, 0);
    const discrepancyCents = totalReceiptAmountCents - allocatedTotalCents;
    return {
      isValid: discrepancyCents === 0,
      allocatedTotalCents,
      discrepancyCents,
    };
  }
}

/**
 * 4. Vendor Subscription & Recurring Burn Predictor
 */
export interface SubscriptionContract {
  id: string;
  vendorName: string;
  cadence: 'MONTHLY' | 'ANNUAL';
  amountCents: number;
  nextRenewalDate: Date;
  status: 'ACTIVE' | 'CANCELED';
}

export class SubscriptionRecurrencePredictor {
  static calculateAnnualizedBurn(subscriptions: SubscriptionContract[]): { totalMonthlyBurnCents: number; totalAnnualizedBurnCents: number; activeCount: number } {
    let totalMonthlyBurnCents = 0;
    let activeCount = 0;

    for (const sub of subscriptions) {
      if (sub.status === 'ACTIVE') {
        activeCount++;
        if (sub.cadence === 'MONTHLY') {
          totalMonthlyBurnCents += sub.amountCents;
        } else if (sub.cadence === 'ANNUAL') {
          totalMonthlyBurnCents += Math.round(sub.amountCents / 12);
        }
      }
    }

    const totalAnnualizedBurnCents = totalMonthlyBurnCents * 12;

    return {
      totalMonthlyBurnCents,
      totalAnnualizedBurnCents,
      activeCount,
    };
  }

  static getUpcomingRenewals(subscriptions: SubscriptionContract[], horizonDays = 30): Array<SubscriptionContract & { daysUntilRenewal: number }> {
    const now = Date.now();

    return subscriptions
      .filter((s) => s.status === 'ACTIVE')
      .map((sub) => {
        const renewalTime = new Date(sub.nextRenewalDate).getTime();
        const diffMs = renewalTime - now;
        const daysUntilRenewal = Math.ceil(diffMs / 86400000);
        return {
          ...sub,
          daysUntilRenewal,
        };
      })
      .filter((s) => s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= horizonDays)
      .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);
  }
}

/**
 * 5. Real-Time Project P&L Profitability Matrix
 */
export interface ProjectProfitabilityInput {
  billedRevenueCents: number;
  wipDirectLaborCostCents: number;
  approvedExpensesCents: number;
}

export interface ProjectProfitabilityReport {
  billedRevenueCents: number;
  totalDirectCostsCents: number;
  grossMarginCents: number;
  grossMarginPercent: number;
  isProfitable: boolean;
}

export class ProjectProfitabilityCalculator {
  static compute(input: ProjectProfitabilityInput): ProjectProfitabilityReport {
    const totalDirectCostsCents = input.wipDirectLaborCostCents + input.approvedExpensesCents;
    const grossMarginCents = input.billedRevenueCents - totalDirectCostsCents;
    const grossMarginPercent =
      input.billedRevenueCents > 0
        ? Math.round((grossMarginCents / input.billedRevenueCents) * 10000) / 100
        : 0;

    return {
      billedRevenueCents: input.billedRevenueCents,
      totalDirectCostsCents,
      grossMarginCents,
      grossMarginPercent,
      isProfitable: grossMarginCents > 0,
    };
  }
}

/**
 * 6. Travel, Hotel & Per-Diem Desk (T&E)
 */
export type CityTier = 'TIER_1_METRO' | 'TIER_2_STANDARD' | 'TIER_3_REGIONAL';

export const PER_DIEM_RATES_CENTS: Record<CityTier, number> = {
  TIER_1_METRO: 9500, // $95.00/day (NYC, LA, SF, London)
  TIER_2_STANDARD: 7500, // $75.00/day (Austin, Chicago, Atlanta)
  TIER_3_REGIONAL: 5500, // $55.00/day (Rural/Regional)
};

export class TravelAndPerDiemEngine {
  static calculatePerDiem(cityTier: CityTier, travelDays: number, mealsProvidedCount = 0): { dailyRateCents: number; totalPerDiemCents: number; deductionCents: number } {
    const dailyRateCents = PER_DIEM_RATES_CENTS[cityTier] || 7500;
    const baseTotal = dailyRateCents * Math.max(1, travelDays);
    // Standard deduction of $20/meal provided by host/catering
    const deductionCents = mealsProvidedCount * 2000;
    const totalPerDiemCents = Math.max(0, baseTotal - deductionCents);

    return {
      dailyRateCents,
      totalPerDiemCents,
      deductionCents,
    };
  }

  static validateHotelBooking(nightlyRateCents: number, policyCeilingCents = 30000): { isCompliant: boolean; excessCents: number } {
    const isCompliant = nightlyRateCents <= policyCeilingCents;
    const excessCents = Math.max(0, nightlyRateCents - policyCeilingCents);
    return { isCompliant, excessCents };
  }
}

/**
 * 7. Petty Cash & Branch Imprest Multi-Wallets
 */
export interface ImprestWalletState {
  walletId: string;
  locationName: string;
  floatLimitCents: number;
  minThresholdCents: number;
  currentBalanceCents: number;
}

export class ImprestMultiWalletEngine {
  static evaluateReplenishment(wallet: ImprestWalletState): { needsReplenishment: boolean; topUpAmountCents: number; utilizationPct: number } {
    const spentCents = wallet.floatLimitCents - wallet.currentBalanceCents;
    const utilizationPct = Math.round((spentCents / wallet.floatLimitCents) * 10000) / 100;
    const needsReplenishment = wallet.currentBalanceCents <= wallet.minThresholdCents;
    const topUpAmountCents = Math.max(0, wallet.floatLimitCents - wallet.currentBalanceCents);

    return {
      needsReplenishment,
      topUpAmountCents,
      utilizationPct,
    };
  }
}

