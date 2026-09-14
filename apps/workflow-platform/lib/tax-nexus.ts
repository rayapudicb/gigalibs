export interface TaxJurisdiction {
  stateCode: string;
  stateName: string;
  baseRate: number;
  localRate: number;
  combinedRate: number;
  hasNexus: boolean;
  notes: string;
}

export const US_TAX_JURISDICTIONS: Record<string, TaxJurisdiction> = {
  CA: {
    stateCode: 'CA',
    stateName: 'California',
    baseRate: 0.0725,
    localRate: 0.0225,
    combinedRate: 0.095,
    hasNexus: true,
    notes: 'Los Angeles / Hawthorne County district tax applied',
  },
  NY: {
    stateCode: 'NY',
    stateName: 'New York',
    baseRate: 0.04,
    localRate: 0.04875,
    combinedRate: 0.08875,
    hasNexus: true,
    notes: 'NYC Metropolitan Commuter Transportation District',
  },
  TX: {
    stateCode: 'TX',
    stateName: 'Texas',
    baseRate: 0.0625,
    localRate: 0.02,
    combinedRate: 0.0825,
    hasNexus: true,
    notes: 'Austin / Travis County transit rate',
  },
  WA: {
    stateCode: 'WA',
    stateName: 'Washington',
    baseRate: 0.065,
    localRate: 0.038,
    combinedRate: 0.103,
    hasNexus: true,
    notes: 'Seattle / King County RTA local option tax',
  },
  MD: {
    stateCode: 'MD',
    stateName: 'Maryland',
    baseRate: 0.06,
    localRate: 0.0,
    combinedRate: 0.06,
    hasNexus: true,
    notes: 'Maryland uniform digital services & equipment rate',
  },
  VA: {
    stateCode: 'VA',
    stateName: 'Virginia',
    baseRate: 0.043,
    localRate: 0.017,
    combinedRate: 0.06,
    hasNexus: true,
    notes: 'Northern Virginia Regional Transportation Authority',
  },
  DE: {
    stateCode: 'DE',
    stateName: 'Delaware',
    baseRate: 0.0,
    localRate: 0.0,
    combinedRate: 0.0,
    hasNexus: false,
    notes: 'No state or local general sales tax (gross receipts only)',
  },
};

export const US_TAX_NEXUS_RATES = US_TAX_JURISDICTIONS;

export interface TaxCalculationResult {
  taxableAmountMinor: number;
  taxRate: number;
  taxAmountMinor: number;
  stateTaxMinor: number;
  localTaxMinor: number;
  isExempt: boolean;
  exemptionReason?: string;
  jurisdiction: TaxJurisdiction;
}

export function calculateSalesTax(params: {
  amountMinor: number;
  stateCode?: string;
  isFarExempt?: boolean;
}): TaxCalculationResult {
  const state = (params.stateCode ?? 'CA').toUpperCase();
  const jurisdiction = US_TAX_JURISDICTIONS[state] ?? {
    stateCode: state,
    stateName: state,
    baseRate: 0.05,
    localRate: 0.01,
    combinedRate: 0.06,
    hasNexus: true,
    notes: 'Standard multi-tier economic nexus rate',
  };

  if (params.isFarExempt) {
    return {
      taxableAmountMinor: params.amountMinor,
      taxRate: 0,
      taxAmountMinor: 0,
      stateTaxMinor: 0,
      localTaxMinor: 0,
      isExempt: true,
      exemptionReason: 'FAR 52.229-3 Federal Government & Prime Defense Exemption',
      jurisdiction,
    };
  }

  const taxAmountMinor = Math.round(params.amountMinor * jurisdiction.combinedRate);
  const stateTaxMinor = Math.round(params.amountMinor * jurisdiction.baseRate);
  const localTaxMinor = taxAmountMinor - stateTaxMinor;

  return {
    taxableAmountMinor: params.amountMinor,
    taxRate: jurisdiction.combinedRate,
    taxAmountMinor,
    stateTaxMinor,
    localTaxMinor,
    isExempt: false,
    jurisdiction,
  };
}
