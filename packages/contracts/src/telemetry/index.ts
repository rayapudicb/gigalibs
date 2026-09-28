import { z } from 'zod';

// ─── ThingsBoard & IoT Telemetry Contracts (Phase 3 & Mobile First) ────────────

export const TelemetrySeveritySchema = z.enum(['INFO', 'WARNING', 'CRITICAL']);
export type TelemetrySeverity = z.infer<typeof TelemetrySeveritySchema>;

export const TelemetryMetricReadingSchema = z.object({
  metric: z.string().min(1).max(64),
  value: z.number(),
  unit: z.string().max(16).default(''),
  thresholdMin: z.number().optional(),
  thresholdMax: z.number().optional(),
  status: z.enum(['NORMAL', 'WARNING', 'CRITICAL']).default('NORMAL'),
  timestamp: z.string().datetime({ offset: true }).optional(),
});
export type TelemetryMetricReading = z.infer<typeof TelemetryMetricReadingSchema>;

export const ThingsBoardWebhookAlertSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  deviceType: z.string().optional(),
  severity: TelemetrySeveritySchema.default('WARNING'),
  metric: z.string().min(1),
  value: z.number(),
  threshold: z.number().optional(),
  unit: z.string().optional().default(''),
  message: z.string().optional(),
  timestamp: z.number().int().optional(), // Epoch ms from ThingsBoard rule node
  token: z.string().optional(),
});
export type ThingsBoardWebhookAlert = z.infer<typeof ThingsBoardWebhookAlertSchema>;

export const TelemetryAlertIngestionResultSchema = z.object({
  status: z.enum(['INGESTED', 'CBM_WORK_ORDER_CREATED', 'IGNORED_DUPLICATE']),
  readingId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  woNumber: z.string().optional(),
  deviceId: z.string(),
  assetId: z.string().uuid().optional(),
  siteRef: z.string().uuid().optional(),
  message: z.string(),
});
export type TelemetryAlertIngestionResult = z.infer<typeof TelemetryAlertIngestionResultSchema>;

export const MobileNodeTelemetryQuerySchema = z.object({
  includeHistorical: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type MobileNodeTelemetryQuery = z.infer<typeof MobileNodeTelemetryQuerySchema>;

export const MobileNodeTelemetryResponseSchema = z.object({
  nodeId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  assetName: z.string().nullable().optional(),
  overallStatus: z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'NO_DATA']),
  lastUpdated: z.string().nullable().optional(),
  metrics: z.array(TelemetryMetricReadingSchema),
  activeCbmWorkOrders: z.array(
    z.object({
      id: z.string().uuid(),
      woNumber: z.string(),
      title: z.string(),
      priority: z.string(),
      status: z.string(),
      createdAt: z.string(),
    })
  ),
  prefillInspectionData: z.record(z.string(), z.any()),
});
export type MobileNodeTelemetryResponse = z.infer<typeof MobileNodeTelemetryResponseSchema>;
