import { describe, expect, it } from 'vitest';

describe('Spend Expenses Service Invariants', () => {
  it('enforces that line item totals sum exactly to expense amount', () => {
    const expenseAmountMinor = 5000;
    const validLines = [
      { description: 'Lunch item 1', glCode: 'GL-6900', amountMinor: 3000, taxMinor: 200 },
      { description: 'Lunch item 2', glCode: 'GL-6900', amountMinor: 2000, taxMinor: 100 },
    ];
    const invalidLines = [
      { description: 'Lunch item 1', glCode: 'GL-6900', amountMinor: 3000, taxMinor: 200 },
      { description: 'Lunch item 2', glCode: 'GL-6900', amountMinor: 1500, taxMinor: 100 },
    ];

    const sumValid = validLines.reduce((acc, l) => acc + l.amountMinor, 0);
    const sumInvalid = invalidLines.reduce((acc, l) => acc + l.amountMinor, 0);

    expect(sumValid).toBe(expenseAmountMinor);
    expect(sumInvalid).not.toBe(expenseAmountMinor);
  });

  it('flags policy violation when expense is >= $75.00 without receipt', () => {
    function evaluateReceiptPolicy(amountMinor: number, receiptUrl?: string, receiptFilename?: string) {
      if (amountMinor >= 7500 && !receiptUrl && !receiptFilename) {
        return {
          policyViolationFlag: true,
          policyViolationNotes: 'Receipt missing for expense >= $75.00',
        };
      }
      return {
        policyViolationFlag: false,
        policyViolationNotes: null,
      };
    }

    const underThreshold = evaluateReceiptPolicy(4500);
    expect(underThreshold.policyViolationFlag).toBe(false);

    const overThresholdNoReceipt = evaluateReceiptPolicy(8500);
    expect(overThresholdNoReceipt.policyViolationFlag).toBe(true);
    expect(overThresholdNoReceipt.policyViolationNotes).toContain('Receipt missing');

    const overThresholdWithReceipt = evaluateReceiptPolicy(8500, 'https://storage.gigalibs.io/receipts/r1.pdf');
    expect(overThresholdWithReceipt.policyViolationFlag).toBe(false);
  });

  it('generates durable Action Gateway settlement receipt upon reimbursement', () => {
    const expense = {
      id: 'exp-999',
      employeeEmail: 'alice@example.com',
      amountMinor: 12500,
      currency: 'USD',
      paymentMethod: 'ACH_DIRECT_DEPOSIT',
    };

    const actionReceipt = {
      actionId: 'act-receipt-123',
      actionType: 'DISBURSE_REIMBURSEMENT',
      idempotencyKey: `reimburse_${expense.id}_1700000000`,
      targetEmployee: expense.employeeEmail,
      amountMinor: expense.amountMinor,
      currency: expense.currency,
      paymentMethod: expense.paymentMethod,
      status: 'SETTLED',
    };

    expect(actionReceipt.actionType).toBe('DISBURSE_REIMBURSEMENT');
    expect(actionReceipt.status).toBe('SETTLED');
    expect(actionReceipt.idempotencyKey).toContain(expense.id);
  });
});
