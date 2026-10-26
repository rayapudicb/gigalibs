import { z } from 'zod';

// WI-OI-120 (M-CUR, Phase 5A): the workspace exchange-rate store's write contract. A workspace records a REAL rate for
// a pair (units of quote per one base unit) with the moment it is effective and where it came from; the FX engine
// converts only with these recorded rates (the fabricated DEFAULT_FX_RATES are gone — see @gigalibs/multi-currency).
// The pure engine and its `fxRateTableFromRows` bridge live in that package; this is only the API's input shape.

const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code.');

export const RecordExchangeRateSchema = z
  .object({
    baseCurrency: CurrencyCodeSchema,
    quoteCurrency: CurrencyCodeSchema,
    /** Units of `quoteCurrency` per one `baseCurrency` unit. Must be a real, positive rate — never defaulted to 1. */
    rate: z.number().positive().finite(),
    /** When the rate is effective (ISO 8601). Defaults to now when omitted. */
    asOf: z.string().datetime({ offset: true }).optional(),
    /** Where the rate came from — a feed name or a manual-entry note. */
    source: z.string().trim().min(1).max(200),
  })
  .strict()
  .refine((dto) => dto.baseCurrency !== dto.quoteCurrency, {
    message: 'baseCurrency and quoteCurrency must differ.',
    path: ['quoteCurrency'],
  });

export type RecordExchangeRateDto = z.infer<typeof RecordExchangeRateSchema>;

/**
 * A base-relative rate lookup: `table[currency]` is units of `currency` per one base unit (the base maps to 1). This is
 * exactly the shape the @gigalibs/multi-currency engine converts with (its `FxRateTable`); it lives here, in the
 * layer-neutral contracts, so the control plane can assemble a workspace's table without importing a module package.
 */
export type FxRateTable = Record<string, number>;

/** Build a base-relative {@link FxRateTable} from a workspace's live rates for `base` (the base itself maps to 1). */
export function fxRateTableFromRows(
  base: string,
  rows: ReadonlyArray<{ readonly quoteCurrency: string; readonly rate: number }>,
): FxRateTable {
  const table: FxRateTable = { [base]: 1 };
  for (const row of rows) table[row.quoteCurrency] = row.rate;
  return table;
}
