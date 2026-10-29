import { Injectable } from '@nestjs/common';
import type { IotPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async summary(principal: IotPrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const counts = await client.query<{ registered: string; online: string; offline: string; critical: string }>(
        `SELECT
           COUNT(*)::text AS registered,
           COUNT(*) FILTER (WHERE status = 'ONLINE')::text AS online,
           COUNT(*) FILTER (WHERE status = 'OFFLINE')::text AS offline,
           (SELECT COUNT(*)::text FROM gigalibs_iot.iot_alerts a
             WHERE a.tenant_id = $1 AND a.severity = 'CRITICAL' AND a.status = 'ACTIVE') AS critical
         FROM gigalibs_iot.iot_devices WHERE tenant_id = $1 AND archived_at IS NULL`,
        [principal.tenantId],
      );
      const protocols = await client.query(
        `SELECT adapter_key, status, device_count FROM gigalibs_iot.protocol_adapters WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      if (protocols.rowCount === 0) {
        await client.query(
          `INSERT INTO gigalibs_iot.protocol_adapters (tenant_id, adapter_key, status, device_count)
           VALUES
             ($1,'MQTT','ONLINE',0), ($1,'MODBUS_TCP','ONLINE',0), ($1,'OPC_UA','STOPPED',0),
             ($1,'HTTP_COAP','ONLINE',0), ($1,'LORAWAN','STANDBY',0)`,
          [principal.tenantId],
        );
      }
      const adapters = (
        await client.query(
          `SELECT adapter_key, status, device_count FROM gigalibs_iot.protocol_adapters WHERE tenant_id = $1 ORDER BY adapter_key`,
          [principal.tenantId],
        )
      ).rows;
      const alerts = await client.query(
        `SELECT id, severity, metric_type, observed_value, triggered_at, cmms_asset_tag, status
           FROM gigalibs_iot.iot_alerts
          WHERE tenant_id = $1 AND triggered_at >= now() - interval '60 minutes'
          ORDER BY triggered_at DESC LIMIT 20`,
        [principal.tenantId],
      );
      const devices = await client.query(
        `SELECT id, name, protocol, status, last_seen_at FROM gigalibs_iot.iot_devices
          WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 8`,
        [principal.tenantId],
      );
      const row = counts.rows[0]!;
      return {
        kpis: {
          devicesRegistered: Number(row.registered),
          devicesOnline: Number(row.online),
          devicesOffline: Number(row.offline),
          activeCriticalAlerts: Number(row.critical),
        },
        protocolAdapters: adapters,
        recentAlerts: alerts.rows,
        recentDevices: devices.rows,
      };
    });
  }
}
