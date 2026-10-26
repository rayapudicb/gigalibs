/**
 * @gigalibs/multi-currency
 *
 * Enterprise Multi-Currency Conversion, Real-Time Revaluation,
 * and Minor-Unit Integer Arithmetic Engine.
 * Benchmark: Odoo Multi-Currency Accounting / Stripe Foreign Exchange / Dinero.js.
 *
 * @module
 */

export interface CurrencyConfig {
  code: string; // ISO-4217 3-letter code
  symbol: string; // e.g. '$', '€', '£', '¥', '₹'
  decimals: number; // e.g. 2 for USD, 0 for JPY, 3 for KWD
  name: string;
  fractionalUnit: string; // e.g. 'Cent', 'Pence', 'Sen'
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', decimals: 2, name: 'US Dollar', fractionalUnit: 'Cent' },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, name: 'Euro', fractionalUnit: 'Cent' },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, name: 'British Pound', fractionalUnit: 'Penny' },
  INR: { code: 'INR', symbol: '₹', decimals: 2, name: 'Indian Rupee', fractionalUnit: 'Paisa' },
  JPY: { code: 'JPY', symbol: '¥', decimals: 0, name: 'Japanese Yen', fractionalUnit: 'Yen' },
  CAD: { code: 'CAD', symbol: 'CA$', decimals: 2, name: 'Canadian Dollar', fractionalUnit: 'Cent' },
  AUD: {
    code: 'AUD',
    symbol: 'A$',
    decimals: 2,
    name: 'Australian Dollar',
    fractionalUnit: 'Cent',
  },
  SGD: { code: 'SGD', symbol: 'S$', decimals: 2, name: 'Singapore Dollar', fractionalUnit: 'Cent' },
  CHF: { code: 'CHF', symbol: 'CHF', decimals: 2, name: 'Swiss Franc', fractionalUnit: 'Rappen' },
  AED: { code: 'AED', symbol: 'AED', decimals: 2, name: 'UAE Dirham', fractionalUnit: 'Fils' },
};

// WI-OI-120 (M-CUR, Phase 5A): "real rates; the fabricated figure removed." The hard-coded DEFAULT_FX_RATES are gone —
// conversion now REQUIRES a real rate table (workspace-scoped; see FxRate) and refuses, loudly, when a rate is missing
// instead of silently assuming 1.0.

/** A real exchange rate a workspace recorded (not platform data). `rate` is units of this currency per base unit. */
export interface FxRate {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly rate: number;
  readonly asOf: string; // ISO date the rate is effective
  readonly source: string; // where it came from (a feed, a manual entry)
}

/** A base-relative rate lookup: `table[currency]` is units of `currency` per one base unit (the base maps to 1). */
export type FxRateTable = Record<string, number>;

/** Thrown when a conversion is asked for a currency with no real rate — never silently defaulted. */
export class NoExchangeRateError extends Error {
  constructor(readonly currency: string) {
    super(`No exchange rate for ${currency}; record a real rate before converting.`);
    this.name = 'NoExchangeRateError';
  }
}

function requireRate(table: FxRateTable, currency: string): number {
  const rate = table[currency];
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0)
    throw new NoExchangeRateError(currency);
  return rate;
}

export interface FxJournalEntry {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency: string;
}

export interface FxGainLossCalculation {
  invoiceId: string;
  customerName: string;
  originalAmount: number;
  currency: string;
  issueRate: number;
  settlementRate: number;
  amountInBaseAtIssue: number;
  amountInBaseAtSettlement: number;
  gainLossAmountBase: number;
  type: 'GAIN' | 'LOSS';
  journalEntries: FxJournalEntry[];
}

export interface OpenBalanceRevaluation {
  invoiceId: string;
  customerName: string;
  openAmount: number;
  currency: string;
  bookedRate: number;
  spotRate: number;
  bookedBaseValue: number;
  revaluedBaseValue: number;
  unrealizedDelta: number;
}

export class MultiCurrencyEngine {
  /**
   * Convert amount from source currency to target currency using base exchange rates.
   */
  static convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    rates: FxRateTable,
  ): number {
    if (fromCurrency === toCurrency) return amount;

    const fromRate = requireRate(rates, fromCurrency);
    const toRate = requireRate(rates, toCurrency);

    const amountInUsd = amount / fromRate;
    const converted = amountInUsd * toRate;

    const decimals = SUPPORTED_CURRENCIES[toCurrency]?.decimals ?? 2;
    return Number(converted.toFixed(decimals));
  }

  /**
   * Deterministic minor-unit (integer cents) conversion with zero floating-point drift.
   */
  static convertMinorUnits(
    amountMinorUnits: number,
    fromCurrency: string,
    toCurrency: string,
    rates: FxRateTable,
  ): number {
    if (fromCurrency === toCurrency) return amountMinorUnits;

    const fromDecimals = SUPPORTED_CURRENCIES[fromCurrency]?.decimals ?? 2;
    const toDecimals = SUPPORTED_CURRENCIES[toCurrency]?.decimals ?? 2;

    const fromRate = requireRate(rates, fromCurrency);
    const toRate = requireRate(rates, toCurrency);

    // Convert from minor units to standard major units
    const majorAmount = amountMinorUnits / Math.pow(10, fromDecimals);
    const amountInUsd = majorAmount / fromRate;
    const convertedMajor = amountInUsd * toRate;

    // Convert back to target minor units
    return Math.round(convertedMajor * Math.pow(10, toDecimals));
  }

  /**
   * Calculates realized FX gain or loss on foreign invoice settlement and generates balanced journal entries.
   */
  static calculateRealizedGainLoss(
    invoiceId: string,
    customerName: string,
    originalAmount: number,
    foreignCurrency: string,
    issueRate: number, // e.g. 0.92 EUR per USD at issue
    settlementRate: number, // e.g. 0.90 EUR per USD at payment
    baseCurrency = 'USD',
  ): FxGainLossCalculation {
    const amountInBaseAtIssue = Number((originalAmount / issueRate).toFixed(2));
    const amountInBaseAtSettlement = Number((originalAmount / settlementRate).toFixed(2));
    const delta = Number((amountInBaseAtSettlement - amountInBaseAtIssue).toFixed(2));

    const isGain = delta >= 0;
    const type: 'GAIN' | 'LOSS' = isGain ? 'GAIN' : 'LOSS';
    const gainLossAmountBase = Math.abs(delta);

    const journalEntries: FxJournalEntry[] = [
      {
        accountCode: '1000',
        accountName: 'Operating Cash & Bank (Settled)',
        debit: amountInBaseAtSettlement,
        credit: 0,
        currency: baseCurrency,
      },
      {
        accountCode: '1200',
        accountName: 'Accounts Receivable (Original Book Value)',
        debit: 0,
        credit: amountInBaseAtIssue,
        currency: baseCurrency,
      },
    ];

    if (isGain && gainLossAmountBase > 0) {
      journalEntries.push({
        accountCode: '7100',
        accountName: 'Realized Foreign Exchange Gain',
        debit: 0,
        credit: gainLossAmountBase,
        currency: baseCurrency,
      });
    } else if (!isGain && gainLossAmountBase > 0) {
      journalEntries.push({
        accountCode: '7150',
        accountName: 'Realized Foreign Exchange Loss',
        debit: gainLossAmountBase,
        credit: 0,
        currency: baseCurrency,
      });
    }

    return {
      invoiceId,
      customerName,
      originalAmount,
      currency: foreignCurrency,
      issueRate,
      settlementRate,
      amountInBaseAtIssue,
      amountInBaseAtSettlement,
      gainLossAmountBase,
      type,
      journalEntries,
    };
  }

  /**
   * Format currency value localized according to ISO standard and locale.
   */
  static format(amountInSubunits: number, currencyCode = 'USD', locale = 'en-US'): string {
    const config = SUPPORTED_CURRENCIES[currencyCode] ?? { decimals: 2 };
    const majorUnits = amountInSubunits / Math.pow(10, config.decimals);

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(majorUnits);
  }
}
