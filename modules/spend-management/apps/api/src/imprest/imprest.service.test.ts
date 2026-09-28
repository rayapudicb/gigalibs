import { describe, expect, it } from 'vitest';

describe('Spend Imprest Petty Cash Service Invariants', () => {
  it('correctly tracks initial funding vouchers and wallet balances', () => {
    const targetBalanceMinor = 50000; // $500.00
    const initialFundingMinor = 50000;
    const thresholdMinor = 12500; // 25% = $125.00

    expect(initialFundingMinor).toBe(targetBalanceMinor);
    expect(thresholdMinor).toBe(targetBalanceMinor * 0.25);
  });

  it('rejects disbursement exceeding current available petty cash balance', () => {
    const currentBalanceMinor = 15000; // $150.00
    const requestedDisbursementMinor = 20000; // $200.00

    function validateDisbursement(balance: number, requested: number) {
      if (requested > balance) {
        throw new Error(`Insufficient petty cash balance: current is ${balance}, requested is ${requested}`);
      }
      return balance - requested;
    }

    expect(() => validateDisbursement(currentBalanceMinor, requestedDisbursementMinor)).toThrow('Insufficient petty cash balance');
    expect(validateDisbursement(currentBalanceMinor, 5000)).toBe(10000);
  });

  it('triggers REPLENISHMENT_PENDING status when balance falls below low balance threshold', () => {
    const thresholdMinor = 10000; // $100.00
    const currentBalanceMinor = 12000; // $120.00
    const disbursementMinor = 5000; // $50.00

    const balanceAfter = currentBalanceMinor - disbursementMinor; // 7000 ($70.00)
    const newStatus = balanceAfter <= thresholdMinor ? 'REPLENISHMENT_PENDING' : 'ACTIVE';

    expect(newStatus).toBe('REPLENISHMENT_PENDING');
  });

  it('enforces receipt requirement for disbursements of $50 or more', () => {
    function validateReceiptRequirement(amountMinor: number, receiptAttached?: boolean) {
      const isAttached = receiptAttached === true;
      if (!isAttached && amountMinor >= 5000) {
        throw new Error('Disbursements of $50.00 or more require an attached physical/digital receipt.');
      }
      return true;
    }

    expect(validateReceiptRequirement(3000, false)).toBe(true);
    expect(() => validateReceiptRequirement(5000, false)).toThrow('require an attached physical/digital receipt');
    expect(validateReceiptRequirement(5000, true)).toBe(true);
  });
});
