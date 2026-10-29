import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IotPrincipal } from '../auth/authorization.js';
import { hashSecret, newApiCredentials } from '../common/crypto.js';
import { DatabaseService } from '../database/database.service.js';

const CreateDeviceSchema = z.object({
  name: z.string().min(1).max(200),
  protocol: z.enum(['MQTT', 'MODBUS_TCP', 'OPC_UA', 'HTTP']),
  protocolConfig: z.record(z.string(), z.unknown()).default({}),
});

const BindAssetSchema = z.object({
  assetId: z.string().uuid(),
  assetTag: z.string().min(1).max(64),
});

const BindMeterSchema = z.object({
  sensorId: z.string().uuid(),
  cmmsMeterId: z.string().uuid(),
  cmmsAssetId: z.string().uuid(),
});

@Injectable()
export class DevicesService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: IotPrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT d.id, d.name, d.protocol, d.status, d.last_seen_at, d.bound_asset_id, d.bound_asset_tag,
                d.api_key_hint, d.version, d.created_at,
                (SELECT MAX(t.read_at) FROM gigalibs_iot.iot_telemetry_raw t WHERE t.device_id = d.id) AS last_reading_at
           FROM gigalibs_iot.iot_devices d
          WHERE d.tenant_id = $1 AND d.archived_at IS NULL
          ORDER BY d.name ASC`,
        [principal.tenantId],
      );
      return { items: result.rows };
    });
  }

  async get(principal: IotPrincipal, deviceId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const device = await this.loadDevice(client, principal.tenantId, deviceId);
      const sensors = await client.query(
        `SELECT id, channel_key, metric_type, unit FROM gigalibs_iot.iot_sensors WHERE tenant_id = $1 AND device_id = $2`,
        [principal.tenantId, deviceId],
      );
      const bindings = await client.query(
        `SELECT b.id, b.sensor_id, b.cmms_meter_id, b.cmms_asset_id, b.confirmed_at, s.channel_key
           FROM gigalibs_iot.iot_device_bindings b
           JOIN gigalibs_iot.iot_sensors s ON s.tenant_id = b.tenant_id AND s.id = b.sensor_id
          WHERE b.tenant_id = $1 AND b.device_id = $2`,
        [principal.tenantId, deviceId],
      );
      const readings = await client.query(
        `SELECT channel_key, value, unit, read_at, payload
           FROM gigalibs_iot.iot_telemetry_raw
          WHERE tenant_id = $1 AND device_id = $2
          ORDER BY read_at DESC LIMIT 500`,
        [principal.tenantId, deviceId],
      );
      return { device, sensors: sensors.rows, bindings: bindings.rows, readings: readings.rows };
    });
  }

  async create(principal: IotPrincipal, raw: unknown) {
    const body = CreateDeviceSchema.parse(raw ?? {});
    const creds = newApiCredentials();
    const id = randomUUID();
    const correlationId = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_iot.iot_devices
           (tenant_id, id, name, protocol, protocol_config, api_key_hint, hmac_secret_hash,
            created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8,$9)`,
        [
          principal.tenantId,
          id,
          body.name,
          body.protocol,
          JSON.stringify(body.protocolConfig),
          creds.hint,
          creds.secretHash,
          principal.subject,
          correlationId,
        ],
      );
      return {
        id,
        name: body.name,
        protocol: body.protocol,
        credential: creds.credential,
        message: 'Store the device credential now; it will not be shown again.',
      };
    });
  }

  async bindAsset(principal: IotPrincipal, deviceId: string, raw: unknown) {
    const body = BindAssetSchema.parse(raw ?? {});
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.loadDevice(client, principal.tenantId, deviceId);
      await client.query(
        `UPDATE gigalibs_iot.iot_devices
            SET bound_asset_id = $3, bound_asset_tag = $4, updated_by = $5, updated_at = now(), version = version + 1
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, deviceId, body.assetId, body.assetTag, principal.subject],
      );
      return { deviceId, assetId: body.assetId, assetTag: body.assetTag, confirmed: true };
    });
  }

  async bindMeter(principal: IotPrincipal, deviceId: string, raw: unknown) {
    const body = BindMeterSchema.parse(raw ?? {});
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.loadDevice(client, principal.tenantId, deviceId);
      const sensor = await client.query(
        `SELECT id FROM gigalibs_iot.iot_sensors WHERE tenant_id = $1 AND device_id = $2 AND id = $3`,
        [principal.tenantId, deviceId, body.sensorId],
      );
      if (!sensor.rows[0]) throw new NotFoundException('Sensor channel not found on this device.');
      await client.query(
        `INSERT INTO gigalibs_iot.iot_device_bindings
           (tenant_id, id, device_id, sensor_id, cmms_meter_id, cmms_asset_id, confirmed_by)
         VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, sensor_id) DO UPDATE
           SET cmms_meter_id = EXCLUDED.cmms_meter_id,
               cmms_asset_id = EXCLUDED.cmms_asset_id,
               confirmed_by = EXCLUDED.confirmed_by,
               confirmed_at = now()`,
        [principal.tenantId, deviceId, body.sensorId, body.cmmsMeterId, body.cmmsAssetId, principal.subject],
      );
      return { deviceId, ...body, confirmed: true };
    });
  }

  async unbindAsset(principal: IotPrincipal, deviceId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.loadDevice(client, principal.tenantId, deviceId);
      await client.query(
        `UPDATE gigalibs_iot.iot_devices
            SET bound_asset_id = NULL, bound_asset_tag = NULL, updated_by = $3, updated_at = now(), version = version + 1
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, deviceId, principal.subject],
      );
      return { deviceId, unbound: true };
    });
  }

  async resolveDeviceForIngest(deviceId: string, credential: string) {
    const client = await this.database.getPool().connect();
    try {
      const result = await client.query(
        `SELECT tenant_id, id, hmac_secret_hash, archived_at FROM gigalibs_iot.iot_devices WHERE id = $1`,
        [deviceId],
      );
      const row = result.rows[0];
      if (!row || row.archived_at) throw new NotFoundException('Device not found.');
      if (hashSecret(credential) !== row.hmac_secret_hash) throw new NotFoundException('Device not found.');
      return row as { tenant_id: string; id: string; hmac_secret_hash: string };
    } finally {
      client.release();
    }
  }

  private async loadDevice(client: import('pg').PoolClient, tenantId: string, deviceId: string) {
    const result = await client.query(
      `SELECT id, name, protocol, status, last_seen_at, battery_pct, bound_asset_id, bound_asset_tag, version
         FROM gigalibs_iot.iot_devices WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL`,
      [tenantId, deviceId],
    );
    if (!result.rows[0]) throw new NotFoundException('Device not found.');
    return result.rows[0];
  }

  async regenerateKey(principal: IotPrincipal, deviceId: string) {
    const creds = newApiCredentials();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.loadDevice(client, principal.tenantId, deviceId);
      await client.query(
        `UPDATE gigalibs_iot.iot_devices
            SET api_key_hint = $3, hmac_secret_hash = $4, updated_by = $5, updated_at = now(), version = version + 1
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, deviceId, creds.hint, creds.secretHash, principal.subject],
      );
      return { credential: creds.credential };
    });
  }
}
