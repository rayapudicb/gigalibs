import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BudgetBurnRateCalculator,
  ExpenseApprovalWorkflowEngine,
  SplitTransactionCalculator,
  SubscriptionRecurrencePredictor,
  ProjectProfitabilityCalculator,
  TravelAndPerDiemEngine,
  ImprestMultiWalletEngine,
} from '../dist/index.js';

describe('💰 Enterprise Spend, Project Budgeting & Expense Engine Certification', () => {
  it('1. BudgetBurnRateCalculator accurately tracks limits, variance and threshold alerts', () => {
    const budget = {
      id: 'bdg_1',
      name: 'Warner Bros Stage 4 Production',
      code: 'BDG-WB-STAGE4',
      totalLimitCents: 5000000, // $50,000.00
      warnThresholdPct: 80,
      spentCents: 4200000, // $42,000.00 (84% -> should trigger WARN_THRESHOLD)
      currency: 'USD',
      status: 'ACTIVE',
    };

    const health = BudgetBurnRateCalculator.evaluate(budget);
    assert.equal(health.spentPercentage, 84);
    assert.equal(health.remainingCents, 800000); // $8,000.00
    assert.equal(health.alertLevel, 'WARN_THRESHOLD');
    assert.equal(health.isOverBudget, false);

    // Over-budget test
    const exceededBudget = { ...budget, spentCents: 5500000 };
    const exceededHealth = BudgetBurnRateCalculator.evaluate(exceededBudget);
    assert.equal(exceededHealth.alertLevel, 'EXCEEDED_CEILING');
    assert.equal(exceededHealth.isOverBudget, true);
  });

  it('2. ExpenseApprovalWorkflowEngine enforces strict state transitions and markup', () => {
    assert.equal(ExpenseApprovalWorkflowEngine.canTransition('DRAFT', 'SUBMITTED'), true);
    assert.equal(ExpenseApprovalWorkflowEngine.canTransition('SUBMITTED', 'APPROVED'), true);
    assert.equal(ExpenseApprovalWorkflowEngine.canTransition('APPROVED', 'REIMBURSED'), true);
    assert.equal(ExpenseApprovalWorkflowEngine.canTransition('REIMBURSED', 'SUBMITTED'), false); // Immutable

    // Billable pass-through with 15% markup on $200 equipment rental
    const billablePrice = ExpenseApprovalWorkflowEngine.calculateBillableClientPrice(20000, 15);
    assert.equal(billablePrice, 23000); // $230.00
  });

  it('3. SplitTransactionCalculator ensures penny-exact sum reconciliation', () => {
    const totalReceipt = 15000; // $150.00
    const validSplits = [
      { category: 'Groceries', amountCents: 10000 },
      { category: 'Household Supplies', amountCents: 5000 },
    ];
    const res = SplitTransactionCalculator.validateAndAllocate(totalReceipt, validSplits);
    assert.equal(res.isValid, true);
    assert.equal(res.discrepancyCents, 0);

    const invalidSplits = [
      { category: 'Groceries', amountCents: 10000 },
      { category: 'Household Supplies', amountCents: 4500 },
    ];
    const invalidRes = SplitTransactionCalculator.validateAndAllocate(totalReceipt, invalidSplits);
    assert.equal(invalidRes.isValid, false);
    assert.equal(invalidRes.discrepancyCents, 500);
  });

  it('4. SubscriptionRecurrencePredictor calculates annualized burn & upcoming renewals', () => {
    const now = new Date();
    const renewalSoon = new Date(now.getTime() + 5 * 86400000); // 5 days from now
    const subs = [
      { id: '1', vendorName: 'AWS Cloud', cadence: 'MONTHLY', amountCents: 120000, nextRenewalDate: renewalSoon, status: 'ACTIVE' },
      { id: '2', vendorName: 'GitHub Enterprise', cadence: 'ANNUAL', amountCents: 240000, nextRenewalDate: renewalSoon, status: 'ACTIVE' },
      { id: '3', vendorName: 'Old Tool', cadence: 'MONTHLY', amountCents: 50000, nextRenewalDate: renewalSoon, status: 'CANCELED' },
    ];

    const burn = SubscriptionRecurrencePredictor.calculateAnnualizedBurn(subs);
    assert.equal(burn.totalMonthlyBurnCents, 140000);
    assert.equal(burn.totalAnnualizedBurnCents, 1680000);
    assert.equal(burn.activeCount, 2);

    const renewals = SubscriptionRecurrencePredictor.getUpcomingRenewals(subs, 10);
    assert.equal(renewals.length, 2);
  });

  it('5. ProjectProfitabilityCalculator computes consolidated P&L margins', () => {
    const pnl = ProjectProfitabilityCalculator.compute({
      billedRevenueCents: 1000000, // $10,000.00 billed
      wipDirectLaborCostCents: 600000, // $6,000.00 labor
      approvedExpensesCents: 150000, // $1,500.00 expenses
    });

    assert.equal(pnl.totalDirectCostsCents, 750000);
    assert.equal(pnl.grossMarginCents, 250000);
    assert.equal(pnl.grossMarginPercent, 25.0);
    assert.equal(pnl.isProfitable, true);
  });

  it('6. TravelAndPerDiemEngine calculates city-tier allowances and hotel compliance', () => {
    const perDiem = TravelAndPerDiemEngine.calculatePerDiem('TIER_1_METRO', 3, 1);
    assert.equal(perDiem.dailyRateCents, 9500);
    assert.equal(perDiem.totalPerDiemCents, 26500);
    assert.equal(perDiem.deductionCents, 2000);

    const compliantHotel = TravelAndPerDiemEngine.validateHotelBooking(25000, 30000);
    assert.equal(compliantHotel.isCompliant, true);
    assert.equal(compliantHotel.excessCents, 0);

    const nonCompliantHotel = TravelAndPerDiemEngine.validateHotelBooking(38000, 30000);
    assert.equal(nonCompliantHotel.isCompliant, false);
    assert.equal(nonCompliantHotel.excessCents, 8000);
  });

  it('7. ImprestMultiWalletEngine flags low balance and computes auto-replenishment top-up', () => {
    const wallet = {
      walletId: 'w_stage4',
      locationName: 'Warner Bros Stage 4 Location Petty Cash',
      floatLimitCents: 500000,
      minThresholdCents: 100000,
      currentBalanceCents: 75000,
    };

    const status = ImprestMultiWalletEngine.evaluateReplenishment(wallet);
    assert.equal(status.needsReplenishment, true);
    assert.equal(status.topUpAmountCents, 425000);
    assert.equal(status.utilizationPct, 85);
  });
});
