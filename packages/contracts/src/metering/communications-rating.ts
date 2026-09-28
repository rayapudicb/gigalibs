import type { BillingUsageInput, BillingRatingOptions, RatedLineItem, RatedQuote } from './communications-billing.types.js';

export const COMMUNICATIONS_PLATFORM_FEE_USD = 79;
export const COMMUNICATIONS_AVG_CALL_MINUTES = 1.5;
export const COMMUNICATIONS_ISOLATION_ADDON_FEE_USD = 199;
export const COMMUNICATIONS_INSTANCE_ADDON_FEE_USD = 499;

export function smsUnitRate(count: number): number {
  if (count <= 0) return 0;
  if (count <= 1000) return 0.018;
  if (count <= 5000) return 0.015;
  if (count <= 20000) return 0.012;
  return 0.01;
}

export function whatsAppUnitRate(count: number): number {
  if (count <= 0) return 0;
  if (count <= 1000) return 0.022;
  if (count <= 5000) return 0.018;
  if (count <= 20000) return 0.015;
  return 0.012;
}

export function emailUnitRate(count: number): number {
  if (count <= 0) return 0;
  if (count <= 1000) return 0.006;
  if (count <= 5000) return 0.005;
  if (count <= 20000) return 0.004;
  return 0.003;
}

export function voiceMinuteRate(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes <= 1500) return 0.042;
  if (minutes <= 5000) return 0.038;
  if (minutes <= 20000) return 0.034;
  return 0.03;
}

export function tierLabel(usage: BillingUsageInput): string {
  const peak = Math.max(
    usage.smsCount ?? 0,
    usage.whatsAppCount ?? 0,
    usage.emailCount ?? 0,
    usage.voiceCalls ?? 0,
  );
  if (peak <= 1000) return 'Starter volume';
  if (peak <= 5000) return 'Growth volume';
  if (peak <= 20000) return 'Scale volume';
  return 'Enterprise volume';
}

export function rateCommunicationsUsage(
  usage: BillingUsageInput,
  options: BillingRatingOptions = {},
): RatedQuote {
  const lineItems: RatedLineItem[] = [];
  const includePlatformFee = options.includePlatformFee ?? true;

  if (includePlatformFee) {
    lineItems.push({
      key: 'platform_base',
      label: 'Communications Platform Subscription',
      category: 'platform',
      quantity: 1,
      unit: 'month',
      unitRateUsd: COMMUNICATIONS_PLATFORM_FEE_USD,
      amountUsd: COMMUNICATIONS_PLATFORM_FEE_USD,
      taxCode: 'txcd_10000000',
    });
  }

  if (usage.smsCount > 0) {
    const rate = smsUnitRate(usage.smsCount);
    lineItems.push({
      key: 'sms_usage',
      label: 'Outbound & Inbound SMS Messages',
      category: 'usage',
      quantity: usage.smsCount,
      unit: 'message',
      unitRateUsd: rate,
      amountUsd: Number((usage.smsCount * rate).toFixed(2)),
      taxCode: 'txcd_20030000',
    });
  }

  if (usage.whatsAppCount > 0) {
    const rate = whatsAppUnitRate(usage.whatsAppCount);
    lineItems.push({
      key: 'whatsapp_usage',
      label: 'WhatsApp Business Conversations',
      category: 'usage',
      quantity: usage.whatsAppCount,
      unit: 'conversation',
      unitRateUsd: rate,
      amountUsd: Number((usage.whatsAppCount * rate).toFixed(2)),
      taxCode: 'txcd_20030000',
    });
  }

  if (usage.emailCount > 0) {
    const rate = emailUnitRate(usage.emailCount);
    lineItems.push({
      key: 'email_usage',
      label: 'Email Inbound & Outbound Delivery',
      category: 'usage',
      quantity: usage.emailCount,
      unit: 'email',
      unitRateUsd: rate,
      amountUsd: Number((usage.emailCount * rate).toFixed(2)),
      taxCode: 'txcd_20030000',
    });
  }

  const effectiveVoiceMinutes =
    usage.voiceMinutes !== undefined
      ? usage.voiceMinutes
      : Number(((usage.voiceCalls ?? 0) * COMMUNICATIONS_AVG_CALL_MINUTES).toFixed(1));

  if (effectiveVoiceMinutes > 0) {
    const rate = voiceMinuteRate(effectiveVoiceMinutes);
    lineItems.push({
      key: 'voice_minutes',
      label: 'VoIP Softphone Voice Minutes',
      category: 'usage',
      quantity: effectiveVoiceMinutes,
      unit: 'minute',
      unitRateUsd: rate,
      amountUsd: Number((effectiveVoiceMinutes * rate).toFixed(2)),
      taxCode: 'txcd_20030000',
    });
  }

  if (options.includeIsolationAddon) {
    lineItems.push({
      key: 'isolation_addon',
      label: 'Dedicated Tenant Isolation Plane',
      category: 'addon',
      quantity: 1,
      unit: 'month',
      unitRateUsd: COMMUNICATIONS_ISOLATION_ADDON_FEE_USD,
      amountUsd: COMMUNICATIONS_ISOLATION_ADDON_FEE_USD,
      taxCode: 'txcd_10000000',
    });
  }

  if (options.includeDedicatedInstanceAddon) {
    lineItems.push({
      key: 'instance_addon',
      label: 'Dedicated Fastify/WebRTC Media Gateway',
      category: 'addon',
      quantity: 1,
      unit: 'month',
      unitRateUsd: COMMUNICATIONS_INSTANCE_ADDON_FEE_USD,
      amountUsd: COMMUNICATIONS_INSTANCE_ADDON_FEE_USD,
      taxCode: 'txcd_10000000',
    });
  }

  const subtotalUsd = Number(
    lineItems.reduce((acc, item) => acc + item.amountUsd, 0).toFixed(2),
  );

  const taxRate = options.estimatedTaxRate ?? 0;
  const taxAmountUsd = Number((subtotalUsd * taxRate).toFixed(2));
  const totalMonthlyUsd = Number((subtotalUsd + taxAmountUsd).toFixed(2));

  return {
    tierLabel: tierLabel(usage),
    effectiveVoiceMinutes,
    subtotalUsd,
    taxAmountUsd,
    totalMonthlyUsd,
    lineItems,
  };
}
