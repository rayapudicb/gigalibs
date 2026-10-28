/** Exact minor-unit arithmetic for the partner credit decision. */
export type CreditComponent = 'OPEN_AR' | 'UNINVOICED_ORDER' | 'PREPAYMENT' | 'OPEN_AP';

export interface CreditDelta {
  readonly component: CreditComponent;
  readonly deltaMinor: bigint;
}

export interface CreditExposure {
  readonly openArMinor: bigint;
  readonly uninvoicedOrdersMinor: bigint;
  readonly prepaymentsMinor: bigint;
  readonly exposureMinor: bigint;
  readonly availableMinor: bigint;
  readonly overLimit: boolean;
}

/**
 * All input is for one tenant, party, owning unit and currency; the repository enforces that key.
 * A correction is another signed delta in the immutable ledger. Negative component balances
 * indicate lost or out-of-order source facts and must not turn into a false credit approval.
 */
export function calculateCreditExposure(deltas: readonly CreditDelta[], creditLimitMinor: bigint): CreditExposure {
  if (creditLimitMinor < 0n) throw new Error('Credit limit cannot be negative.');
  let openArMinor = 0n;
  let uninvoicedOrdersMinor = 0n;
  let prepaymentsMinor = 0n;
  for (const delta of deltas) {
    if (delta.component === 'OPEN_AR') openArMinor += delta.deltaMinor;
    else if (delta.component === 'UNINVOICED_ORDER') uninvoicedOrdersMinor += delta.deltaMinor;
    else if (delta.component === 'PREPAYMENT') prepaymentsMinor += delta.deltaMinor;
    else if (delta.component === 'OPEN_AP') continue;
    else throw new Error('Unknown credit component.');
  }
  if (openArMinor < 0n || uninvoicedOrdersMinor < 0n || prepaymentsMinor < 0n) {
    throw new Error('Credit ledger is missing a source fact or has an invalid correction.');
  }
  const exposureMinor = openArMinor + uninvoicedOrdersMinor - prepaymentsMinor;
  const availableMinor = creditLimitMinor - exposureMinor;
  return {
    openArMinor,
    uninvoicedOrdersMinor,
    prepaymentsMinor,
    exposureMinor,
    availableMinor,
    overLimit: availableMinor < 0n,
  };
}
