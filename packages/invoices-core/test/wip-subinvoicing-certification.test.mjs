import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CostPlusMarkupCalculator,
  SubInvoiceSequencer,
  BillableItemLockManager,
  InvoiceVoidManager,
  AccountingSyncBridge,
} from '../dist/index.js';

describe('Universal WIP, Incremental Sub-Invoicing & Financial Lock Engine', () => {
  const createMockShifts = () => {
    const records = [];
    const roles = [
      { role: 'Camera Operator', raw: 4500, markupPct: 35 },
      { role: 'Gaffer / Chief Lighting', raw: 4000, markupPct: 35 },
      { role: 'Audio / Sound Engineer', raw: 3800, markupPct: 35 },
      { role: 'Key Grip', raw: 3500, markupPct: 35 },
      { role: 'Production Assistant', raw: 2200, markupPct: 35 },
    ];

    for (let i = 1; i <= 30; i++) {
      const isApproved = i <= 26;
      const role = roles[(i - 1) % roles.length];
      const calc = CostPlusMarkupCalculator.computeLine(role.raw, 8, { type: 'PERCENTAGE', value: role.markupPct });

      records.push({
        id: `rec_${i}`,
        tenantId: 'tenant_warner',
        sourceType: 'TIMESHEET_SHIFT',
        sourceId: `TS-SHIFT-${String(i).padStart(3, '0')}`,
        projectOrEventId: 'EVT-2026-WARNER-STAGE4',
        projectOrEventName: 'Warner Bros Stage 4 Shoot',
        resourceName: `Crew Member #${i}`,
        resourceRole: role.role,
        date: '2026-08-10',
        quantity: 8,
        rawCostCents: role.raw,
        totalRawCostCents: calc.totalRawCostCents,
        markupType: 'PERCENTAGE',
        markupValue: role.markupPct,
        markupAmountCents: calc.markupAmountCents,
        billedUnitPriceCents: calc.billedUnitPriceCents,
        billedTotalAmountCents: calc.billedTotalAmountCents,
        marginPercent: calc.marginPercent,
        approvalStatus: isApproved ? 'APPROVED' : 'PENDING',
        billingStatus: 'UNBILLED',
      });
    }
    return records;
  };

  it('1. CostPlusMarkupCalculator calculates accurate margins and pricing', () => {
    const line = CostPlusMarkupCalculator.computeLine(4500, 8, { type: 'PERCENTAGE', value: 35 });
    assert.equal(line.rawCostCents, 4500);
    assert.equal(line.totalRawCostCents, 36000);
    assert.equal(line.billedUnitPriceCents, 6075);
    assert.equal(line.billedTotalAmountCents, 48600);
    assert.equal(line.markupAmountCents, 12600);
    assert.equal(line.marginPercent, 25.93);
  });

  it('2. BillableItemLockManager accurately computes real-time WIP Burndown', () => {
    const shifts = createMockShifts();
    const summary = BillableItemLockManager.computeWipSummary('EVT-2026-WARNER-STAGE4', shifts);

    assert.equal(summary.totalRecordsCount, 30);
    assert.equal(summary.approvedRecordsCount, 26);
    assert.equal(summary.pendingRecordsCount, 4);
    assert.equal(summary.readyToBillCount, 26);
    assert.equal(summary.alreadyInvoicedCount, 0);
    assert.equal(summary.unbilledApprovedRawCostCents, 756000);
    assert.equal(summary.unbilledApprovedBilledRevenueCents, 1020600);
  });

  it('3. Multi-Round Incremental Billing (Round 1: 26 approved -> INV-001; Round 2: remaining 4 approved -> INV-001-SUB1)', () => {
    let shifts = createMockShifts();

    // ROUND 1: Bill first 26 approved shifts
    const round1Eligible = BillableItemLockManager.filterEligibleForBilling(shifts);
    assert.equal(round1Eligible.length, 26);

    const invoice1Number = SubInvoiceSequencer.formatSubInvoiceNumber('INV-2026-0001', 0);
    assert.equal(invoice1Number, 'INV-2026-0001');

    const lockedRound1 = BillableItemLockManager.lockItems(round1Eligible, 'inv_hdr_001');
    shifts = shifts.map((s) => lockedRound1.find((l) => l.id === s.id) || s);

    const summaryAfterRound1 = BillableItemLockManager.computeWipSummary('EVT-2026-WARNER-STAGE4', shifts);
    assert.equal(summaryAfterRound1.alreadyInvoicedCount, 26);
    assert.equal(summaryAfterRound1.readyToBillCount, 0);
    assert.equal(summaryAfterRound1.pendingRecordsCount, 4);

    // Attempt zero-delta billing
    const zeroDelta = BillableItemLockManager.filterEligibleForBilling(shifts);
    assert.equal(zeroDelta.length, 0);

    // ROUND 2: Production manager approves remaining 4 shifts on Day 3
    shifts = shifts.map((s) => (s.approvalStatus === 'PENDING' ? { ...s, approvalStatus: 'APPROVED' } : s));

    const summaryBeforeRound2 = BillableItemLockManager.computeWipSummary('EVT-2026-WARNER-STAGE4', shifts);
    assert.equal(summaryBeforeRound2.readyToBillCount, 4);

    const round2Eligible = BillableItemLockManager.filterEligibleForBilling(shifts);
    assert.equal(round2Eligible.length, 4);

    const invoice2Number = SubInvoiceSequencer.formatSubInvoiceNumber('INV-2026-0001', 1);
    assert.equal(invoice2Number, 'INV-2026-0001-SUB1');

    const lockedRound2 = BillableItemLockManager.lockItems(round2Eligible, 'inv_hdr_002');
    shifts = shifts.map((s) => lockedRound2.find((l) => l.id === s.id) || s);

    const summaryAfterRound2 = BillableItemLockManager.computeWipSummary('EVT-2026-WARNER-STAGE4', shifts);
    assert.equal(summaryAfterRound2.alreadyInvoicedCount, 30);
    assert.equal(summaryAfterRound2.readyToBillCount, 0);
    assert.equal(summaryAfterRound2.pendingRecordsCount, 0);
  });

  it('4. Zero-Double-Billing Concurrency Invariant: locked records reject re-locking', () => {
    const shifts = createMockShifts();
    const eligible = BillableItemLockManager.filterEligibleForBilling(shifts);
    const locked = BillableItemLockManager.lockItems(eligible, 'inv_hdr_001');

    assert.throws(
      () => {
        BillableItemLockManager.lockItems(locked, 'inv_hdr_duplicate');
      },
      /Double-billing invariant breached: Record rec_1 is already locked/
    );
  });

  it('5. Reason-Tracked Voiding safely releases locked records back to UNBILLED & generates balanced reversal', () => {
    let shifts = createMockShifts();
    const eligible = BillableItemLockManager.filterEligibleForBilling(shifts);
    const locked = BillableItemLockManager.lockItems(eligible, 'inv_hdr_001');
    shifts = shifts.map((s) => locked.find((l) => l.id === s.id) || s);

    const mockInvoice = {
      id: 'inv_hdr_001',
      invoiceNumber: 'INV-2026-0001',
      tenantId: 'tenant_warner',
      status: 'OPEN',
      currency: 'USD',
      subtotalCents: 1020600,
      taxAmountCents: 84199,
      totalAmountCents: 1104799,
      lineItems: eligible,
    };

    const voidResult = InvoiceVoidManager.voidInvoice(
      mockInvoice,
      'Client production coordinator requested adjustment for overtime differential',
      'Alex Rivera (Billing Admin)'
    );

    assert.equal(voidResult.voidedInvoice.status, 'VOID');
    assert.equal(voidResult.voidedInvoice.voidReason, 'Client production coordinator requested adjustment for overtime differential');
    assert.equal(voidResult.reversalLedgerEvent.balanced, true);

    const totalDebits = voidResult.reversalLedgerEvent.journalEntries.reduce((s, e) => s + e.debitCents, 0);
    const totalCredits = voidResult.reversalLedgerEvent.journalEntries.reduce((s, e) => s + e.creditCents, 0);
    assert.equal(totalDebits, totalCredits);

    shifts = BillableItemLockManager.releaseItems(shifts, 'inv_hdr_001');
    const summaryAfterVoid = BillableItemLockManager.computeWipSummary('EVT-2026-WARNER-STAGE4', shifts);
    assert.equal(summaryAfterVoid.readyToBillCount, 26);
    assert.equal(summaryAfterVoid.alreadyInvoicedCount, 0);
  });

  it('6. Accounting synchronization fails closed without a certified provider adapter', () => {
    const invoice = {
      id: 'inv_hdr_001',
      invoiceNumber: 'INV-2026-0001-SUB1',
      tenantId: 'tenant_warner',
      status: 'OPEN',
      notes: 'Standard production shoot billing',
    };

    assert.throws(
      () => AccountingSyncBridge.pushInvoice(invoice, 'QUICKBOOKS_ONLINE'),
      /No certified accounting provider adapter is configured/,
    );
  });
});
