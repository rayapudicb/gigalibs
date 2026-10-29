import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verifyHmac } from '../common/crypto.js';
import { DatabaseService } from '../database/database.service.js';
import { DevicesService } from '../devices/devices.service.js';
import { queueMeterReadingRelay } from '../telemetry/meter-relay.js';
import { TelemetryEvaluationService } from '../telemetry/telemetry-evaluation.service.js';

const ReadingSchema = z.object({
  channelKey: z.string().regex(/^[A-Z0-9_]{2,64}$/),
  value: z.number(),
  unit: z.string().max(32).optional(),
  metricType: z.string().max(80).optional(),
  idempotencyKey: z.string().min(1).max(128),
  readAt: z.string().datetime().optional(),
  batteryPct: z.number().min(0).max(100).optional(),
});

const IngestSchema = z.object({
  readings: z.array(ReadingSchema).min(1).max(100),
});

@Injectable()
export class IngestService {
  constructor(
    private readonly database: DatabaseService,
    private readonly devices: DevicesService,
    private readonly evaluation: TelemetryEvaluationService,
  ) {}

  async ingest(
    deviceId: string,
    rawBody: Buffer,
    credential: string | undefined,
    signature: string | undefined,
    payload: unknown,
  ) {
    if (!credential) throw new UnauthorizedException('Device credential is required.');
    const body = IngestSchema.parse(payload ?? {});
    const device = await this.devices.resolveDeviceForIngest(deviceId, credential);
    if (!verifyHmac(credential, rawBody, signature)) {
      throw new UnauthorizedException('Invalid device signature.');
    }
    return this.database.withTenantTransaction(device.tenant_id, async (client) => {
      const deviceRow = await client.query<{ bound_asset_id: string | null; bound_asset_tag: string | null }>(
        `SELECT bound_asset_id, bound_asset_tag FROM gigalibs_iot.iot_devices WHERE tenant_id = $1 AND id = $2`,
        [device.tenant_id, deviceId],
      );
      const boundAssetId = deviceRow.rows[0]?.bound_asset_id ?? null;
      const boundAssetTag = deviceRow.rows[0]?.bound_asset_tag ?? null;

      for (const reading of body.readings) {
        let sensorId: string | null = null;
        const sensor = await client.query(
          `SELECT id FROM gigalibs_iot.iot_sensors WHERE tenant_id = $1 AND device_id = $2 AND channel_key = $3`,
          [device.tenant_id, deviceId, reading.channelKey],
        );
        if (sensor.rows[0]) {
          sensorId = sensor.rows[0].id;
        } else {
          sensorId = randomUUID();
          await client.query(
            `INSERT INTO gigalibs_iot.iot_sensors (tenant_id, id, device_id, channel_key, metric_type, unit)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              device.tenant_id,
              sensorId,
              deviceId,
              reading.channelKey,
              reading.metricType ?? reading.channelKey,
              reading.unit ?? '',
            ],
          );
        }
        await client.query(
          `INSERT INTO gigalibs_iot.iot_telemetry_raw
             (tenant_id, device_id, sensor_id, channel_key, value, unit, idempotency_key, read_at, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, now()), $9::jsonb)
           ON CONFLICT (tenant_id, device_id, idempotency_key) DO NOTHING`,
          [
            device.tenant_id,
            deviceId,
            sensorId,
            reading.channelKey,
            reading.value,
            reading.unit ?? null,
            reading.idempotencyKey,
            reading.readAt ?? null,
            JSON.stringify({ source: 'HTTP_INGEST' }),
          ],
        );

        const metricType = reading.metricType ?? reading.channelKey;
        await this.evaluation.evaluateReading(
          client,
          device.tenant_id,
          deviceId,
          sensorId!,
          reading.channelKey,
          metricType,
          reading.value,
          boundAssetId,
          boundAssetTag,
        );

        const binding = await client.query<{ cmms_meter_id: string; cmms_asset_id: string }>(
          `SELECT cmms_meter_id, cmms_asset_id FROM gigalibs_iot.iot_device_bindings
            WHERE tenant_id = $1 AND device_id = $2 AND sensor_id = $3`,
          [device.tenant_id, deviceId, sensorId],
        );
        if (binding.rows[0]) {
          await queueMeterReadingRelay(client, {
            tenantId: device.tenant_id,
            deviceId,
            cmmsMeterId: binding.rows[0].cmms_meter_id,
            cmmsAssetId: binding.rows[0].cmms_asset_id,
            value: reading.value,
            readAt: reading.readAt ?? new Date().toISOString(),
            idempotencyKey: reading.idempotencyKey,
          });
        }
      }
      await client.query(
        `UPDATE gigalibs_iot.iot_devices
            SET status = 'ONLINE', last_seen_at = now(), battery_pct = COALESCE($3, battery_pct), updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [device.tenant_id, deviceId, body.readings.find((r) => r.batteryPct !== undefined)?.batteryPct ?? null],
      );
      await client.query(
        `INSERT INTO gigalibs_iot.outbox_events
           (tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, payload)
         VALUES ($1, 'telemetry.raw.v1', 'TELEMETRY_RAW_V1', 'iot_device', $2, 1, $3, $4::jsonb)`,
        [device.tenant_id, deviceId, randomUUID(), JSON.stringify({ deviceId, readings: body.readings.length })],
      );
      return { accepted: body.readings.length };
    });
  }
}
