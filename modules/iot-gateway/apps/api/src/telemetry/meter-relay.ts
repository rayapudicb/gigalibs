import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

/** Queues CMMS meter readings on the IoT outbox (no cross-schema writes). */
export async function queueMeterReadingRelay(
  client: PoolClient,
  input: {
    readonly tenantId: string;
    readonly deviceId: string;
    readonly cmmsMeterId: string;
    readonly cmmsAssetId: string;
    readonly value: number;
    readonly readAt: string;
    readonly idempotencyKey: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO gigalibs_iot.outbox_events
       (tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, payload)
     VALUES ($1,'iot.meter_readings.v1','IOT_METER_READING_V1','cmms_meter',$2,1,$3,$4::jsonb)`,
    [
      input.tenantId,
      input.cmmsMeterId,
      randomUUID(),
      JSON.stringify({
        meterId: input.cmmsMeterId,
        assetId: input.cmmsAssetId,
        deviceId: input.deviceId,
        value: input.value,
        readAt: input.readAt,
        requestKey: input.idempotencyKey,
        source: 'IOT_TELEMETRY',
      }),
    ],
  );
}
