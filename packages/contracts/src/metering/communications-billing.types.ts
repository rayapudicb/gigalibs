export interface BillingUsageInput {
  smsCount: number;
  whatsAppCount: number;
  emailCount: number;
  voiceCalls: number;
  voiceMinutes?: number;
}

export interface BillingRatingOptions {
  includePlatformFee?: boolean;
  includeIsolationAddon?: boolean;
  includeDedicatedInstanceAddon?: boolean;
  estimatedTaxRate?: number;
}

export interface RatedLineItem {
  key: string;
  label: string;
  category: 'platform' | 'usage' | 'addon' | 'tax';
  quantity: number;
  unit: string;
  unitRateUsd: number;
  amountUsd: number;
  taxCode?: string;
}

export interface RatedQuote {
  tierLabel: string;
  effectiveVoiceMinutes: number;
  subtotalUsd: number;
  taxAmountUsd: number;
  totalMonthlyUsd: number;
  lineItems: RatedLineItem[];
}
