import { describe, it, expect } from 'vitest';
import {
  smsUnitRate,
  whatsAppUnitRate,
  emailUnitRate,
  voiceMinuteRate,
  tierLabel,
  rateCommunicationsUsage,
  COMMUNICATIONS_PLATFORM_FEE_USD,
  COMMUNICATIONS_ISOLATION_ADDON_FEE_USD,
} from './communications-rating.js';
import type { RatedLineItem } from './communications-billing.types.js';

describe('Communications Rating Engine', () => {
  describe('Unit Rates', () => {
    it('returns zero for 0 or negative counts', () => {
      expect(smsUnitRate(0)).toBe(0);
      expect(smsUnitRate(-5)).toBe(0);
      expect(whatsAppUnitRate(0)).toBe(0);
      expect(emailUnitRate(0)).toBe(0);
      expect(voiceMinuteRate(0)).toBe(0);
    });

    it('applies tiered pricing for SMS correctly', () => {
      expect(smsUnitRate(500)).toBe(0.018);
      expect(smsUnitRate(1000)).toBe(0.018);
      expect(smsUnitRate(2500)).toBe(0.015);
      expect(smsUnitRate(5000)).toBe(0.015);
      expect(smsUnitRate(10000)).toBe(0.012);
      expect(smsUnitRate(20000)).toBe(0.012);
      expect(smsUnitRate(50000)).toBe(0.01);
    });

    it('applies tiered pricing for WhatsApp correctly', () => {
      expect(whatsAppUnitRate(500)).toBe(0.022);
      expect(whatsAppUnitRate(2000)).toBe(0.018);
      expect(whatsAppUnitRate(10000)).toBe(0.015);
      expect(whatsAppUnitRate(25000)).toBe(0.012);
    });

    it('applies tiered pricing for Voice Minutes correctly', () => {
      expect(voiceMinuteRate(1000)).toBe(0.042);
      expect(voiceMinuteRate(3000)).toBe(0.038);
      expect(voiceMinuteRate(15000)).toBe(0.034);
      expect(voiceMinuteRate(30000)).toBe(0.03);
    });
  });

  describe('Tier Labels', () => {
    it('categorizes peak volume correctly', () => {
      expect(tierLabel({ smsCount: 500, whatsAppCount: 100, emailCount: 0, voiceCalls: 10 })).toBe('Starter volume');
      expect(tierLabel({ smsCount: 1500, whatsAppCount: 0, emailCount: 0, voiceCalls: 0 })).toBe('Growth volume');
      expect(tierLabel({ smsCount: 500, whatsAppCount: 8000, emailCount: 0, voiceCalls: 0 })).toBe('Scale volume');
      expect(tierLabel({ smsCount: 0, whatsAppCount: 0, emailCount: 0, voiceCalls: 25000 })).toBe('Enterprise volume');
    });
  });

  describe('rateCommunicationsUsage', () => {
    it('calculates baseline platform fee when usage is zero', () => {
      const quote = rateCommunicationsUsage({
        smsCount: 0,
        whatsAppCount: 0,
        emailCount: 0,
        voiceCalls: 0,
      });

      expect(quote.subtotalUsd).toBe(COMMUNICATIONS_PLATFORM_FEE_USD);
      expect(quote.taxAmountUsd).toBe(0);
      expect(quote.totalMonthlyUsd).toBe(COMMUNICATIONS_PLATFORM_FEE_USD);
      expect(quote.lineItems).toHaveLength(1);
      expect(quote.lineItems[0]?.key).toBe('platform_base');
    });

    it('calculates full omnichannel quote with voice minutes and tax', () => {
      const quote = rateCommunicationsUsage(
        {
          smsCount: 1000,       // 1000 * 0.018 = $18
          whatsAppCount: 1000,  // 1000 * 0.022 = $22
          emailCount: 1000,      // 1000 * 0.006 = $6
          voiceCalls: 100,       // 100 calls -> 150 mins * 0.042 = $6.30
        },
        {
          includePlatformFee: true, // $79
          includeIsolationAddon: true, // $199
          estimatedTaxRate: 0.1, // 10%
        },
      );

      // Subtotal = 79 (platform) + 18 (sms) + 22 (whatsapp) + 6 (email) + 6.30 (voice) + 199 (isolation) = 330.30
      expect(quote.effectiveVoiceMinutes).toBe(150);
      expect(quote.subtotalUsd).toBe(330.3);
      expect(quote.taxAmountUsd).toBe(33.03);
      expect(quote.totalMonthlyUsd).toBe(363.33);
      expect(quote.lineItems.find((i: RatedLineItem) => i.key === 'isolation_addon')?.amountUsd).toBe(COMMUNICATIONS_ISOLATION_ADDON_FEE_USD);
    });
  });
});
