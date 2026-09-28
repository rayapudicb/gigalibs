import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ThingsBoardWebhookAlertSchema,
  type ThingsBoardWebhookAlert,
} from '@gigalibs/contracts';
import { telemetryBridgeService } from '../lib/telemetry-bridge-service';
import { prisma } from '@gigalibs/db';

vi.mock('@gigalibs/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    platformOutboxEvent: {
      create: vi.fn(),
    },
  },
}));

describe('Phase 3: ThingsBoard Bridge & Condition-Based Maintenance (CBM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe('CBM Automation & Work Order Generation', () => {
    const alert: ThingsBoardWebhookAlert = {
      deviceId: 'tb_motor_line_01',
      deviceName: 'Kiln Main Drive Motor',
      severity: 'CRITICAL',
      metric: 'bearing_temp_c',
      value: 94.2,
      threshold: 80.0,
      unit: '°C',
      message: 'Bearing temperature critical overheating',
    };

    it('automatically generates an emergency CMMS work order on critical threshold breach', async () => {
      // Mock device binding resolution
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          id: 'binding_uuid_01',
          device_id: 'tb_motor_line_01',
          device_name: 'Kiln Main Drive Motor',
          device_type: 'VIBRATION_TEMP_SENSOR',
          asset_id: 'asset_uuid_99',
          site_ref: 'site_uuid_10',
          meter_id: 'meter_uuid_55',
          asset_name: 'Kiln Drive Motor #1',
          min_threshold: null,
          max_threshold: '80.0',
          unit: '°C',
        },
      ]);

      // Mock meter reading insert
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        { id: 'reading_uuid_123' },
      ]);

      // Mock executeRaw for meter and binding update
      (prisma.$executeRaw as any).mockResolvedValue(1);

      // Mock work order creation
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        { id: 'wo_uuid_auto_cbm', wo_number: 'WO-887766' },
      ]);

      const result = await telemetryBridgeService.handleThingsBoardAlert(
        'tenant_alpha',
        alert
      );

      expect(result.status).toBe('CBM_WORK_ORDER_CREATED');
      expect(result.workOrderId).toBe('wo_uuid_auto_cbm');
      expect(result.woNumber).toBe('WO-887766');
      expect(prisma.platformOutboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aggregateType: 'CMMS_WORK_ORDER',
            eventType: 'cmms.cbm_alert.dispatched.v1',
          }),
        })
      );
    });

    it('ingests normal telemetry without spawning redundant work orders', async () => {
      const normalAlert: ThingsBoardWebhookAlert = {
        deviceId: 'tb_motor_line_01',
        severity: 'INFO',
        metric: 'bearing_temp_c',
        value: 65.0,
        unit: '°C',
      };

      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          id: 'binding_uuid_01',
          device_id: 'tb_motor_line_01',
          device_name: 'Kiln Main Drive Motor',
          device_type: 'VIBRATION_TEMP_SENSOR',
          asset_id: 'asset_uuid_99',
          site_ref: 'site_uuid_10',
          meter_id: 'meter_uuid_55',
          asset_name: 'Kiln Drive Motor #1',
          min_threshold: null,
          max_threshold: '80.0',
          unit: '°C',
        },
      ]);

      (prisma.$queryRaw as any).mockResolvedValueOnce([{ id: 'reading_normal_01' }]);
      (prisma.$executeRaw as any).mockResolvedValue(1);

      const result = await telemetryBridgeService.handleThingsBoardAlert(
        'tenant_alpha',
        normalAlert
      );

      expect(result.status).toBe('INGESTED');
      expect(result.workOrderId).toBeUndefined();
    });
  });

  describe('Mobile-First Live Telemetry & Pre-filled Rounds', () => {
    it('computes live gauge metrics and pre-fills inspection data', async () => {
      // Mock bindings query
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          asset_id: 'asset_uuid_99',
          asset_name: 'Kiln Drive Motor #1',
          device_id: 'tb_motor_line_01',
          last_payload: {},
          last_telemetry_at: new Date('2026-09-27T10:00:00Z'),
          meter_id: 'meter_uuid_1',
          metric_name: 'Bearing Temperature',
          unit: '°C',
          last_value: '72.5',
          min_threshold: '20.0',
          max_threshold: '80.0',
        },
      ]);

      // Mock active WOs query
      (prisma.$queryRaw as any).mockResolvedValueOnce([]);

      const result = await telemetryBridgeService.getMobileNodeTelemetry(
        'tenant_alpha',
        'site_uuid_10'
      );

      expect(result.overallStatus).toBe('NORMAL');
      expect(result.metrics.length).toBe(1);
      expect(result.metrics[0]?.value).toBe(72.5);
      expect(result.prefillInspectionData['bearing_temperature']).toBe(72.5);
    });
  });
});
