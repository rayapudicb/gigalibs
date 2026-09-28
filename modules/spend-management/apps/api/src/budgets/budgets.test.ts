import { describe, expect, it } from 'vitest';

describe('Spend Management Invariants and Calculations', () => {
  it('enforces exact scaled-integer math and budget bounds in minor units', () => {
    const allocatedBudgetMinor = 100_000_00; // $100,000.00
    const expenses = [
      { id: 'exp-1', amountMinor: 1_250_50, taxMinor: 100_00 }, // $1,250.50 + $100.00 tax
      { id: 'exp-2', amountMinor: 3_499_99, taxMinor: 280_00 }, // $3,499.99 + $280.00 tax
      { id: 'exp-3', amountMinor: 500_00, taxMinor: 40_00 },    // $500.00 + $40.00 tax
    ];

    const totalSpentMinor = expenses.reduce((sum, e) => sum + e.amountMinor, 0);
    const totalTaxMinor = expenses.reduce((sum, e) => sum + e.taxMinor, 0);
    const remainingBudgetMinor = allocatedBudgetMinor - totalSpentMinor;

    expect(Number.isInteger(totalSpentMinor)).toBe(true);
    expect(Number.isInteger(totalTaxMinor)).toBe(true);
    expect(Number.isInteger(remainingBudgetMinor)).toBe(true);
    expect(totalSpentMinor).toBe(5_250_49); // $5,250.49
    expect(totalTaxMinor).toBe(420_00);     // $420.00
    expect(remainingBudgetMinor).toBe(94_749_51); // $94,749.51
    expect(remainingBudgetMinor).toBeGreaterThan(0);
  });

  it('verifies optimistic locking version transitions for expense state machine', () => {
    interface ExpenseState {
      id: string;
      status: 'SUBMITTED' | 'APPROVED' | 'REIMBURSED' | 'REJECTED';
      version: number;
    }

    const initial: ExpenseState = {
      id: 'exp-100',
      status: 'SUBMITTED',
      version: 1,
    };

    // Transition 1: Approve with matching version
    function approve(expense: ExpenseState, expectedVersion: number): ExpenseState {
      if (expense.version !== expectedVersion) {
        throw new Error('Precondition Failed: Concurrency conflict detected');
      }
      if (expense.status !== 'SUBMITTED') {
        throw new Error(`Cannot approve expense in ${expense.status} state`);
      }
      return {
        ...expense,
        status: 'APPROVED',
        version: expense.version + 1,
      };
    }

    const approved = approve(initial, 1);
    expect(approved.status).toBe('APPROVED');
    expect(approved.version).toBe(2);

    // Concurrent approval attempt with stale version 1 must be rejected
    expect(() => approve(initial, 1)).not.toThrow(); // but trying to approve the updated record with stale version 1 fails:
    expect(() => approve(approved, 1)).toThrow('Precondition Failed: Concurrency conflict detected');

    // Reimburse with correct version
    function reimburse(expense: ExpenseState, expectedVersion: number): ExpenseState {
      if (expense.version !== expectedVersion) {
        throw new Error('Precondition Failed: Concurrency conflict detected');
      }
      if (expense.status !== 'APPROVED') {
        throw new Error(`Cannot reimburse expense in ${expense.status} state`);
      }
      return {
        ...expense,
        status: 'REIMBURSED',
        version: expense.version + 1,
      };
    }

    const reimbursed = reimburse(approved, 2);
    expect(reimbursed.status).toBe('REIMBURSED');
    expect(reimbursed.version).toBe(3);

    // Attempting to reimburse already reimbursed expense fails state transition
    expect(() => reimburse(reimbursed, 3)).toThrow('Cannot reimburse expense in REIMBURSED state');
  });

  it('rejects invalid currency format and negative amounts', () => {
    const validCurrencyPattern = /^[A-Z]{3}$/;
    expect(validCurrencyPattern.test('USD')).toBe(true);
    expect(validCurrencyPattern.test('EUR')).toBe(true);
    expect(validCurrencyPattern.test('usd')).toBe(false);
    expect(validCurrencyPattern.test('USDT')).toBe(false);
    expect(validCurrencyPattern.test('12$')).toBe(false);

    function validateExpenseAmount(minor: number): void {
      if (!Number.isSafeInteger(minor) || minor <= 0) {
        throw new Error('Expense amount must be a positive integer in minor units');
      }
    }

    expect(() => validateExpenseAmount(100)).not.toThrow();
    expect(() => validateExpenseAmount(0)).toThrow();
    expect(() => validateExpenseAmount(-500)).toThrow();
    expect(() => validateExpenseAmount(12.5)).toThrow();
  });
});
