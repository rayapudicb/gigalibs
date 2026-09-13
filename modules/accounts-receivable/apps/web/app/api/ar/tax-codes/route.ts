/**
 * GET /api/ar/tax-codes
 *
 * Returns the tax code catalog for the TaxCodeSelect control.
 *
 * Today this is a static list of the most common global tax codes.
 * When the AR backend grows a tenant tax-code API, swap the return
 * value below for a proxied fetch (same auth pattern as /api/ar/customers).
 *
 * Cache: public 1 h — tax codes change rarely.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export interface TaxCode {
  code: string;
  label: string;
  /** Rate as a decimal fraction, e.g. 0.20 for 20 %. */
  rate: number;
  type: 'VAT' | 'GST' | 'SALES_TAX' | 'EXCISE' | 'NONE';
}

const TAX_CODES: TaxCode[] = [
  // VAT — European / international
  { code: 'VAT_GB_20',    label: 'UK Standard VAT',         rate: 0.20,  type: 'VAT' },
  { code: 'VAT_GB_5',     label: 'UK Reduced VAT',          rate: 0.05,  type: 'VAT' },
  { code: 'VAT_GB_0',     label: 'UK Zero Rate',            rate: 0.00,  type: 'VAT' },
  { code: 'VAT_EU_20',    label: 'EU Standard VAT 20 %',    rate: 0.20,  type: 'VAT' },
  { code: 'VAT_EU_19',    label: 'EU Standard VAT 19 %',    rate: 0.19,  type: 'VAT' },
  { code: 'VAT_EU_21',    label: 'EU Standard VAT 21 %',    rate: 0.21,  type: 'VAT' },
  { code: 'VAT_EU_23',    label: 'EU Standard VAT 23 %',    rate: 0.23,  type: 'VAT' },
  { code: 'VAT_EU_25',    label: 'EU Standard VAT 25 %',    rate: 0.25,  type: 'VAT' },
  { code: 'VAT_EU_0',     label: 'EU Zero Rate / Exempt',   rate: 0.00,  type: 'VAT' },
  { code: 'VAT_AU_10',    label: 'Australia GST 10 %',      rate: 0.10,  type: 'GST' },
  { code: 'VAT_NZ_15',    label: 'New Zealand GST 15 %',    rate: 0.15,  type: 'GST' },
  { code: 'VAT_CA_5',     label: 'Canada GST 5 %',          rate: 0.05,  type: 'GST' },
  { code: 'VAT_CA_13',    label: 'Canada HST 13 %',         rate: 0.13,  type: 'GST' },
  { code: 'VAT_CA_15',    label: 'Canada HST 15 %',         rate: 0.15,  type: 'GST' },
  { code: 'VAT_SG_9',     label: 'Singapore GST 9 %',       rate: 0.09,  type: 'GST' },
  { code: 'VAT_IN_18',    label: 'India GST 18 %',          rate: 0.18,  type: 'GST' },
  { code: 'VAT_IN_12',    label: 'India GST 12 %',          rate: 0.12,  type: 'GST' },
  { code: 'VAT_IN_5',     label: 'India GST 5 %',           rate: 0.05,  type: 'GST' },
  { code: 'VAT_IN_0',     label: 'India GST Exempt',        rate: 0.00,  type: 'GST' },
  { code: 'VAT_ZA_15',    label: 'South Africa VAT 15 %',   rate: 0.15,  type: 'VAT' },
  // US sales tax (common flat rates for reference — actual rate is state-determined)
  { code: 'US_SALES_CA',  label: 'US Sales Tax — CA 7.25 %', rate: 0.0725, type: 'SALES_TAX' },
  { code: 'US_SALES_NY',  label: 'US Sales Tax — NY 8 %',    rate: 0.08,  type: 'SALES_TAX' },
  { code: 'US_SALES_TX',  label: 'US Sales Tax — TX 6.25 %', rate: 0.0625, type: 'SALES_TAX' },
  // No tax
  { code: 'NONE',         label: 'No tax / Exempt',          rate: 0.00,  type: 'NONE' },
];

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { items: TAX_CODES },
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Cache for 1 hour — tax codes change very rarely
        'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}
