import { Injectable } from '@nestjs/common';
import type { IotPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AlertsService {
  constructor(private readonly database: DatabaseService) {}

  list(principal: IotPrincipal, status?: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let where = 'tenant_id = $1';
      if (status) {
        values.push(status);
        where += ` AND status = $${values.length}`;
      }
      const result = await client.query(
        `SELECT id, device_id, severity, metric_type, observed_value, threshold_value, status,
                cmms_asset_tag, work_order_id, triggered_at, resolved_at
           FROM gigalibs_iot.iot_alerts WHERE ${where} ORDER BY triggered_at DESC LIMIT 200`,
        values,
      );
      return { items: result.rows };
    });
  }

  get(principal: IotPrincipal, alertId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM gigalibs_iot.iot_alerts WHERE tenant_id = $1 AND id = $2`, [
        principal.tenantId,
        alertId,
      ]);
      return result.rows[0] ?? null;
    });
  }
}
