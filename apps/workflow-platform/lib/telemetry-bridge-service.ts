import { prisma } from '@gigalibs/db';
import type {
  ThingsBoardWebhookAlert,
  TelemetryAlertIngestionResult,
  MobileNodeTelemetryResponse,
  TelemetryMetricReading,
} from '@gigalibs/contracts';

interface DeviceBindingRow {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  asset_id: string;
  site_ref: string | null;
  meter_id: string | null;
  asset_name: string;
  min_threshold: string | null;
  max_threshold: string | null;
  unit: string | null;
}

export class TelemetryBridgeService {
  /**
   * Processes incoming alerts from self-hosted ThingsBoard Community Edition rule nodes.
   */
  async handleThingsBoardAlert(
    tenantId: string,
    alert: ThingsBoardWebhookAlert
  ): Promise<TelemetryAlertIngestionResult> {
    // 1. Resolve hardware device binding in gigalibs_cmms
    const bindings = await prisma.$queryRaw<DeviceBindingRow[]>`
      SELECT 
        b.id,
        b.device_id,
        b.device_name,
        b.device_type,
        b.asset_id,
        b.site_ref,
        b.meter_id,
        a.name as asset_name,
        m.min_threshold,
        m.max_threshold,
        m.unit
      FROM gigalibs_cmms.telemetry_device_bindings b
      JOIN gigalibs_cmms.assets a ON a.tenant_id = b.tenant_id AND a.id = b.asset_id
      LEFT JOIN gigalibs_cmms.meters m ON m.tenant_id = b.tenant_id AND m.id = b.meter_id
      WHERE b.tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND b.device_id = ${alert.deviceId}
        AND b.is_active = true
      LIMIT 1;
    `;

    if (!bindings || bindings.length === 0) {
      return {
        status: 'INGESTED',
        deviceId: alert.deviceId,
        message: `Device "${alert.deviceId}" has no active asset binding in tenant ${tenantId}. Telemetry logged.`,
      };
    }

    const binding = bindings[0]!;
    const readAt = alert.timestamp ? new Date(alert.timestamp) : new Date();
    const readingKey = crypto.randomUUID();

    // 2. If a meter is bound, record the telemetry reading in gigalibs_cmms.meter_readings
    let readingId: string | undefined;
    if (binding.meter_id) {
      const readingRows = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO gigalibs_cmms.meter_readings (
          tenant_id,
          meter_id,
          value,
          read_at,
          source,
          notes,
          request_key,
          recorded_by,
          correlation_id
        ) VALUES (
          ${tenantId}::gigalibs_cmms.tenant_ref,
          ${binding.meter_id}::uuid,
          ${alert.value}::numeric,
          ${readAt},
          'THINGSBOARD',
          ${alert.message || 'ThingsBoard Rule Node Alert'},
          ${readingKey}::uuid,
          'system:thingsboard_bridge'::gigalibs_cmms.principal_ref,
          ${crypto.randomUUID()}
        )
        RETURNING id;
      `;

      if (readingRows && readingRows.length > 0) {
        readingId = readingRows[0]!.id;
      }

      // Update meter last_value and last_read_at
      await prisma.$executeRaw`
        UPDATE gigalibs_cmms.meters
        SET 
          last_value = ${alert.value}::numeric,
          last_read_at = ${readAt},
          updated_at = now()
        WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
          AND id = ${binding.meter_id}::uuid;
      `;
    }

    // Update last payload and timestamp on device binding
    await prisma.$executeRaw`
      UPDATE gigalibs_cmms.telemetry_device_bindings
      SET 
        last_telemetry_at = ${readAt},
        last_payload = ${JSON.stringify(alert)}::jsonb,
        updated_at = now()
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND id = ${binding.id}::uuid;
    `;

    // 3. Condition-Based Maintenance (CBM): If severity is WARNING or CRITICAL, spawn emergency Work Order
    const isCritical = alert.severity === 'CRITICAL';
    const isWarning = alert.severity === 'WARNING';

    if (isCritical || isWarning) {
      const woPriority = isCritical ? 'EMERGENCY' : 'HIGH';
      const woType = isCritical ? 'EMERGENCY' : 'REACTIVE';
      const woNumber = `WO-${Date.now().toString().slice(-6)}`;
      const title = `CBM Alert: ${binding.asset_name} - ${alert.metric} threshold breach`;
      const description = `Automated Condition-Based Maintenance trigger from ThingsBoard Community Edition. Metric: ${alert.metric}, Measured Value: ${alert.value} ${alert.unit || ''}, Threshold: ${alert.threshold ?? 'N/A'}. Details: ${alert.message || 'Automated sensor alarm'}.`;

      const woRows = await prisma.$queryRaw<Array<{ id: string; wo_number: string }>>`
        INSERT INTO gigalibs_cmms.work_orders (
          tenant_id,
          wo_number,
          type,
          priority,
          status,
          title,
          description,
          asset_id,
          site_ref,
          requires_signature,
          trigger_source,
          created_by,
          updated_by,
          correlation_id
        ) VALUES (
          ${tenantId}::gigalibs_cmms.tenant_ref,
          ${woNumber},
          ${woType},
          ${woPriority},
          'OPEN',
          ${title},
          ${description},
          ${binding.asset_id}::uuid,
          ${binding.site_ref ? binding.site_ref : null}::uuid,
          true,
          'CBM_TELEMETRY',
          'system:thingsboard_bridge'::gigalibs_cmms.principal_ref,
          'system:thingsboard_bridge'::gigalibs_cmms.principal_ref,
          ${crypto.randomUUID()}
        )
        RETURNING id, wo_number;
      `;

      const createdWo = woRows[0]!;

      // 4. Emit platform outbox event for real-time mobile push notifications
      try {
        await prisma.platformOutboxEvent.create({
          data: {
            tenantId,
            aggregateType: 'CMMS_WORK_ORDER',
            aggregateId: createdWo.id,
            eventType: 'cmms.cbm_alert.dispatched.v1',
            payload: {
              workOrderId: createdWo.id,
              woNumber: createdWo.wo_number,
              assetId: binding.asset_id,
              assetName: binding.asset_name,
              siteRef: binding.site_ref,
              severity: alert.severity,
              metric: alert.metric,
              value: alert.value,
              unit: alert.unit,
            },
          },
        });
      } catch (err) {
        console.error('[TelemetryBridgeService] Outbox emit failed:', err);
      }

      return {
        status: 'CBM_WORK_ORDER_CREATED',
        readingId,
        workOrderId: createdWo.id,
        woNumber: createdWo.wo_number,
        deviceId: alert.deviceId,
        assetId: binding.asset_id,
        siteRef: binding.site_ref || undefined,
        message: `Condition-based maintenance work order ${createdWo.wo_number} auto-dispatched for ${binding.asset_name}.`,
      };
    }

    return {
      status: 'INGESTED',
      readingId,
      deviceId: alert.deviceId,
      assetId: binding.asset_id,
      siteRef: binding.site_ref || undefined,
      message: `Telemetry reading of ${alert.value} ${alert.unit} ingested successfully for ${binding.asset_name}.`,
    };
  }

  /**
   * Mobile-First Live Telemetry & Pre-filled Rounds Resolver.
   * Called when a technician scans a physical QR code on a spatial node or machine.
   */
  async getMobileNodeTelemetry(
    tenantId: string,
    nodeId: string
  ): Promise<MobileNodeTelemetryResponse> {
    // 1. Fetch device bindings linked to this spatial node or asset
    const bindings = await prisma.$queryRaw<Array<{
      asset_id: string;
      asset_name: string;
      device_id: string;
      last_payload: any;
      last_telemetry_at: Date | null;
      meter_id: string | null;
      metric_name: string | null;
      unit: string | null;
      last_value: string | null;
      min_threshold: string | null;
      max_threshold: string | null;
    }>>`
      SELECT 
        b.asset_id,
        a.name as asset_name,
        b.device_id,
        b.last_payload,
        b.last_telemetry_at,
        m.id as meter_id,
        m.name as metric_name,
        m.unit,
        m.last_value,
        m.min_threshold,
        m.max_threshold
      FROM gigalibs_cmms.telemetry_device_bindings b
      JOIN gigalibs_cmms.assets a ON a.tenant_id = b.tenant_id AND a.id = b.asset_id
      LEFT JOIN gigalibs_cmms.meters m ON m.tenant_id = b.tenant_id AND m.id = b.meter_id
      WHERE b.tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND (b.site_ref = ${nodeId}::uuid OR b.asset_id = ${nodeId}::uuid)
        AND b.is_active = true;
    `;

    // 2. Fetch active open CBM work orders for this node
    const activeWos = await prisma.$queryRaw<Array<{
      id: string;
      wo_number: string;
      title: string;
      priority: string;
      status: string;
      created_at: Date;
    }>>`
      SELECT id, wo_number, title, priority, status, created_at
      FROM gigalibs_cmms.work_orders
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND (site_ref = ${nodeId}::uuid OR asset_id = ${nodeId}::uuid)
        AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')
      ORDER BY priority DESC, created_at DESC
      LIMIT 10;
    `;

    if (!bindings || bindings.length === 0) {
      return {
        nodeId,
        assetId: null,
        assetName: null,
        overallStatus: 'NO_DATA',
        metrics: [],
        activeCbmWorkOrders: activeWos.map((w) => ({
          id: w.id,
          woNumber: w.wo_number,
          title: w.title,
          priority: w.priority,
          status: w.status,
          createdAt: w.created_at.toISOString(),
        })),
        prefillInspectionData: {},
      };
    }

    const first = bindings[0]!;
    const metrics: TelemetryMetricReading[] = [];
    const prefillData: Record<string, any> = {};
    let overallStatus: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';

    for (const b of bindings) {
      if (b.metric_name && b.last_value !== null) {
        const val = parseFloat(b.last_value);
        const minThresh = b.min_threshold ? parseFloat(b.min_threshold) : undefined;
        const maxThresh = b.max_threshold ? parseFloat(b.max_threshold) : undefined;

        let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
        if (maxThresh !== undefined && val > maxThresh) {
          status = val > maxThresh * 1.15 ? 'CRITICAL' : 'WARNING';
        } else if (minThresh !== undefined && val < minThresh) {
          status = val < minThresh * 0.85 ? 'CRITICAL' : 'WARNING';
        }

        if (status === 'CRITICAL') overallStatus = 'CRITICAL';
        else if (status === 'WARNING' && overallStatus !== 'CRITICAL') overallStatus = 'WARNING';

        metrics.push({
          metric: b.metric_name,
          value: val,
          unit: b.unit || '',
          thresholdMin: minThresh,
          thresholdMax: maxThresh,
          status,
          timestamp: b.last_telemetry_at?.toISOString(),
        });

        // Pre-fill keys for Phase 2 inspection form
        prefillData[b.metric_name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = val;
      }
    }

    return {
      nodeId,
      assetId: first.asset_id,
      assetName: first.asset_name,
      overallStatus,
      lastUpdated: first.last_telemetry_at?.toISOString() || null,
      metrics,
      activeCbmWorkOrders: activeWos.map((w) => ({
        id: w.id,
        woNumber: w.wo_number,
        title: w.title,
        priority: w.priority,
        status: w.status,
        createdAt: w.created_at.toISOString(),
      })),
      prefillInspectionData: prefillData,
    };
  }
}

export const telemetryBridgeService = new TelemetryBridgeService();
