/** Exact minor-unit AR/AP netting for a partner that is both customer and vendor. */

/**
 * iDempiere runs a simultaneous AR control account (11200) and AP control account (21100) for the
 * same counterparty. When a partner both owes us (open AR) and is owed by us (open AP), the two can
 * be offset in a netting run, leaving a single residual position to settle — reducing settlement
 * volume and real credit exposure. All amounts are for one tenant, party, owning unit and currency.
 */
export type NettingPosition = 'NET_RECEIVABLE' | 'NET_PAYABLE' | 'SETTLED';

export interface PartnerNetting {
  /** What the partner owes us (receivable control). */
  readonly openArMinor: bigint;
  /** What we owe the partner (payable control). */
  readonly openApMinor: bigint;
  /** The amount offset in the netting run: min(AR, AP). */
  readonly nettableMinor: bigint;
  /** Residual receivable after netting (0 unless we are the net creditor). */
  readonly netReceivableMinor: bigint;
  /** Residual payable after netting (0 unless we are the net debtor). */
  readonly netPayableMinor: bigint;
  /** Which side, if any, is left to settle. */
  readonly position: NettingPosition;
  /** The residual amount to settle (>= 0); 0 when fully SETTLED. */
  readonly netAmountMinor: bigint;
}

/**
 * Offset a partner's open AR against its open AP. The smaller side is netted in full; the larger
 * side's residual is the single position to settle. Negative balances mean lost or out-of-order
 * source facts and must never silently net to a false settlement.
 */
export function calculatePartnerNetting(openArMinor: bigint, openApMinor: bigint): PartnerNetting {
  if (openArMinor < 0n || openApMinor < 0n) {
    throw new Error('Open AR and AP balances cannot be negative for netting.');
  }
  const nettableMinor = openArMinor < openApMinor ? openArMinor : openApMinor;
  const netReceivableMinor = openArMinor - nettableMinor;
  const netPayableMinor = openApMinor - nettableMinor;
  const position: NettingPosition =
    netReceivableMinor > 0n ? 'NET_RECEIVABLE' : netPayableMinor > 0n ? 'NET_PAYABLE' : 'SETTLED';
  const netAmountMinor = netReceivableMinor > 0n ? netReceivableMinor : netPayableMinor;
  return {
    openArMinor,
    openApMinor,
    nettableMinor,
    netReceivableMinor,
    netPayableMinor,
    position,
    netAmountMinor,
  };
}
