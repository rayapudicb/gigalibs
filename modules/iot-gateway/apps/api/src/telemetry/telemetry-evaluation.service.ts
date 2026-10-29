import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  consecutiveAbove,
  rateOfChange,
  type TelemetryPoint,
} from '@gigalibs/rule-engine-universal';

type ConditionRuleRow = {
  id: string;
  metric_type: string;
  condition_type: 'THRESHOLD' | 'RATE_OF_CHANGE' | 'CONSECUTIVE_READINGS';
  threshold_value: string;
  severity: 'WARNING' | 'CRITICAL';
  consecutive_count: number | null;
  window_ms: number | null;
  scope_mode: string;
  scope_asset_id: string | null;
};

@Injectable()
export class TelemetryEvaluationService {
  async evaluateReading(
    client: PoolClient,
    tenantId: string,
    deviceId: string,
    sensorId: string,
    channelKey: string,
    metricType: string,
    value: number,
    boundAssetId: string | null,
    boundAssetTag: string | null,
  ): Promise<void> {
    const rules = await client.query<ConditionRuleRow>(
      `SELECT id, metric_type, condition_type, threshold_value, severity, consecutive_count, window_ms, scope_mode, scope_asset_id
         FROM gigalibs_iot.iot_condition_rules
        WHERE tenant_id = $1 AND enabled = true AND metric_type = $2`,
      [tenantId, metricType],
    );
    if (rules.rowCount === 0) return;

    const series = await client.query<{ value: string; read_at: Date }>(
      `SELECT value, read_at FROM gigalibs_iot.iot_telemetry_raw
        WHERE tenant_id = $1 AND device_id = $2 AND channel_key = $3
        ORDER BY read_at DESC LIMIT 32`,
      [tenantId, deviceId, channelKey],
    );
    const points: TelemetryPoint[] = series.rows
      .map((row) => ({ value: Number(row.value), readAtMs: new Date(row.read_at).getTime() }))
      .reverse();

    for (const rule of rules.rows) {
      if (rule.scope_mode === 'ASSET' && rule.scope_asset_id && rule.scope_asset_id !== boundAssetId) continue;
      const threshold = Number(rule.threshold_value);
      const breached = this.evaluateRule(points, rule, threshold);
      if (!breached) continue;

      const alertId = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_iot.iot_alerts
           (tenant_id, id, device_id, rule_id, severity, metric_type, observed_value, threshold_value, status,
            cmms_asset_id, cmms_asset_tag, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10,$11::jsonb)`,
        [
          tenantId,
          alertId,
          deviceId,
          rule.id,
          rule.severity,
          metricType,
          value,
          threshold,
          boundAssetId,
          boundAssetTag,
          JSON.stringify({ channelKey, sensorId }),
        ],
      );
      await client.query(
        `INSERT INTO gigalibs_iot.outbox_events
           (tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, payload)
         VALUES ($1,'telemetry.alert.v1','TELEMETRY_ALERT_V1','iot_alert',$2,1,$3,$4::jsonb)`,
        [
          tenantId,
          alertId,
          randomUUID(),
          JSON.stringify({
            alertId,
            deviceId,
            severity: rule.severity,
            metricType,
            observedValue: value,
            thresholdValue: threshold,
            assetId: boundAssetId,
            assetTag: boundAssetTag,
          }),
        ],
      );
      if (rule.severity === 'CRITICAL') {
        await client.query(
          `UPDATE gigalibs_iot.iot_devices SET status = 'ALERT', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, deviceId],
        );
      }
    }
  }

  private evaluateRule(points: readonly TelemetryPoint[], rule: ConditionRuleRow, threshold: number): boolean {
    if (points.length === 0) return false;
    if (rule.condition_type === 'CONSECUTIVE_READINGS') {
      return consecutiveAbove(points, threshold, rule.consecutive_count ?? 3);
    }
    if (rule.condition_type === 'RATE_OF_CHANGE') {
      const roc = rateOfChange(points, rule.window_ms ?? 60_000);
      return roc !== null && roc > threshold;
    }
    const latest = points[points.length - 1]!;
    return latest.value > threshold;
  }
}
