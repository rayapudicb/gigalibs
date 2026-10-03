/**
 * WI-EAM-004 — Telemetry Ingestion & Meter-Driven PM Triggers Unit Tests
 *
 * Validates contract schemas for multi-source IoT telemetry ingestion,
 * condition breach triggers, and continuous usage interval triggers.
 */
import {
  CreateCmmsMeterTriggerV1Schema,
  CreateCmmsMeterV1Schema,
  IngestCmmsTelemetryBatchV1Schema,
  RecordCmmsMeterReadingV1Schema,
  UpdateCmmsMeterTriggerV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../common/command.js';

describe('Meter Contract Schemas (WI-EAM-004)', () => {
  describe('CreateCmmsMeterV1Schema', () => {
    it('accepts a valid GAUGE meter with min/max thresholds', () => {
      const result = parseInput(CreateCmmsMeterV1Schema, {
        assetId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Bearing Temperature',
        unit: '°C',
        readingType: 'GAUGE',
        minThreshold: 20,
        maxThreshold: 85,
      });
      expect(result.name).toBe('Bearing Temperature');
      expect(result.readingType).toBe('GAUGE');
      expect(result.minThreshold).toBe(20);
      expect(result.maxThreshold).toBe(85);
    });

    it('accepts a COUNTER meter (run hours) without thresholds', () => {
      const result = parseInput(CreateCmmsMeterV1Schema, {
        assetId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Operating Run Hours',
        unit: 'hours',
        readingType: 'COUNTER',
      });
      expect(result.readingType).toBe('COUNTER');
      expect(result.minThreshold).toBeUndefined();
    });

    it('rejects when minThreshold exceeds maxThreshold', () => {
      expect(() =>
        parseInput(CreateCmmsMeterV1Schema, {
          assetId: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Invalid Limits',
          unit: 'bar',
          minThreshold: 100,
          maxThreshold: 50,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('RecordCmmsMeterReadingV1Schema (Multi-Source Telemetry)', () => {
    it('accepts a MANUAL reading', () => {
      const result = parseInput(RecordCmmsMeterReadingV1Schema, {
        requestKey: '550e8400-e29b-41d4-a716-446655440002',
        value: 72.5,
        source: 'MANUAL',
        notes: 'Observed during morning inspection walkthrough',
      });
      expect(result.source).toBe('MANUAL');
      expect(result.value).toBe(72.5);
    });

    it('accepts an IOT_TELEMETRY reading with deviceId', () => {
      const result = parseInput(RecordCmmsMeterReadingV1Schema, {
        requestKey: '550e8400-e29b-41d4-a716-446655440003',
        value: 1240.5,
        source: 'IOT_TELEMETRY',
        deviceId: 'SENSOR-TURBINE-01-VIB',
      });
      expect(result.source).toBe('IOT_TELEMETRY');
      expect(result.deviceId).toBe('SENSOR-TURBINE-01-VIB');
    });

    it('accepts CONNECTOR_HUB and SCADA sources', () => {
      const scadaResult = parseInput(RecordCmmsMeterReadingV1Schema, {
        requestKey: '550e8400-e29b-41d4-a716-446655440004',
        value: 4.8,
        source: 'SCADA',
      });
      expect(scadaResult.source).toBe('SCADA');

      const hubResult = parseInput(RecordCmmsMeterReadingV1Schema, {
        requestKey: '550e8400-e29b-41d4-a716-446655440005',
        value: 500,
        source: 'CONNECTOR_HUB',
      });
      expect(hubResult.source).toBe('CONNECTOR_HUB');
    });
  });

  describe('IngestCmmsTelemetryBatchV1Schema (High-Throughput Batch Ingestion)', () => {
    it('accepts a valid batch payload with multiple telemetry readings', () => {
      const result = parseInput(IngestCmmsTelemetryBatchV1Schema, {
        source: 'IOT_TELEMETRY',
        readings: [
          {
            meterId: '550e8400-e29b-41d4-a716-446655440010',
            requestKey: '550e8400-e29b-41d4-a716-446655440011',
            value: 45.2,
            deviceId: 'GATEWAY-GW01',
          },
          {
            meterId: '550e8400-e29b-41d4-a716-446655440020',
            requestKey: '550e8400-e29b-41d4-a716-446655440021',
            value: 1050,
            deviceId: 'GATEWAY-GW01',
          },
        ],
      });
      expect(result.source).toBe('IOT_TELEMETRY');
      expect(result.readings).toHaveLength(2);
      expect(result.readings[0]!.value).toBe(45.2);
    });

    it('rejects an empty readings array', () => {
      expect(() =>
        parseInput(IngestCmmsTelemetryBatchV1Schema, {
          source: 'IOT_TELEMETRY',
          readings: [],
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('CreateCmmsMeterTriggerV1Schema (Condition & Interval Policies)', () => {
    it('accepts a THRESHOLD_BREACH condition trigger with UPPER breach', () => {
      const result = parseInput(CreateCmmsMeterTriggerV1Schema, {
        meterId: '550e8400-e29b-41d4-a716-446655440001',
        triggerType: 'THRESHOLD_BREACH',
        thresholdType: 'UPPER',
        thresholdValue: 90,
        jobPlanId: '550e8400-e29b-41d4-a716-446655440099',
        workOrderTitle: 'Critical Temperature Exceeded',
        workOrderPriority: 'EMERGENCY',
      });
      expect(result.triggerType).toBe('THRESHOLD_BREACH');
      expect(result.thresholdType).toBe('UPPER');
      expect(result.thresholdValue).toBe(90);
      expect(result.workOrderPriority).toBe('EMERGENCY');
    });

    it('accepts a USAGE_INTERVAL counter trigger (e.g. 500-hour service)', () => {
      const result = parseInput(CreateCmmsMeterTriggerV1Schema, {
        meterId: '550e8400-e29b-41d4-a716-446655440001',
        triggerType: 'USAGE_INTERVAL',
        intervalValue: 500,
        workOrderTitle: '500-Hour Scheduled Lubrication & Filter Change',
        workOrderPriority: 'HIGH',
      });
      expect(result.triggerType).toBe('USAGE_INTERVAL');
      expect(result.intervalValue).toBe(500);
      expect(result.workOrderPriority).toBe('HIGH');
    });

    it('accepts an OUT_OF_BOUNDS breach direction', () => {
      const result = parseInput(CreateCmmsMeterTriggerV1Schema, {
        meterId: '550e8400-e29b-41d4-a716-446655440001',
        triggerType: 'THRESHOLD_BREACH',
        thresholdType: 'OUT_OF_BOUNDS',
        workOrderTitle: 'Pressure Out of Normal Operating Envelope',
      });
      expect(result.thresholdType).toBe('OUT_OF_BOUNDS');
    });
  });

  describe('UpdateCmmsMeterTriggerV1Schema', () => {
    it('accepts partial updates with expectedVersion', () => {
      const result = parseInput(UpdateCmmsMeterTriggerV1Schema, {
        expectedVersion: 2,
        intervalValue: 1000,
        workOrderPriority: 'EMERGENCY',
        isActive: false,
      });
      expect(result.expectedVersion).toBe(2);
      expect(result.intervalValue).toBe(1000);
      expect(result.workOrderPriority).toBe('EMERGENCY');
      expect(result.isActive).toBe(false);
    });

    it('rejects update without expectedVersion', () => {
      expect(() =>
        parseInput(UpdateCmmsMeterTriggerV1Schema, {
          intervalValue: 1000,
        }),
      ).toThrow(BadRequestException);
    });
  });
});
