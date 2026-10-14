import { describe, expect, it } from 'vitest';
import { ThingsBoardWebhookAlertSchema } from '@gigalibs/contracts';

// WI-OI-120ak (S2): the web app's telemetry bridge service (`lib/telemetry-bridge-service.ts`, which nothing imported
// and which queried the database from the web app) was removed with its tests. The contract schema keeps its tests.
describe('Phase 3: ThingsBoard Bridge & Condition-Based Maintenance (CBM)', () => {
  describe('ThingsBoard Alert Schema Validation', () => {
    it('validates a well-formed ThingsBoard rule node alert packet', () => {
      const validPayload = {
        deviceId: 'tb_motor_line_01',
        deviceName: 'Kiln Main Drive Motor',
        severity: 'CRITICAL',
        metric: 'vibration_mm_s',
        value: 7.8,
        threshold: 4.5,
        unit: 'mm/s',
        message: 'Bearing vibration exceeded ISO 10816 threshold',
        timestamp: Date.now(),
      };

      const parsed = ThingsBoardWebhookAlertSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.severity).toBe('CRITICAL');
        expect(parsed.data.value).toBe(7.8);
      }
    });

    it('rejects an invalid payload missing deviceId or metric', () => {
      const invalid = { value: 99.5 };
      const parsed = ThingsBoardWebhookAlertSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });
});
