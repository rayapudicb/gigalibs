import { Injectable, Logger } from '@nestjs/common';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly db: DatabaseService) {}

  async getStatus(
    tenantId: string,
  ): Promise<{ configured: boolean; tenantId: string; initializedAt?: string }> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT tenant_id, initialized_at
       FROM gigalibs_analytics.tenant_analytics_configs
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return { configured: false, tenantId };
    return {
      configured: true,
      tenantId: result.rows[0].tenant_id,
      initializedAt: result.rows[0].initialized_at,
    };
  }

  async setupTenant(
    tenantId: string,
    _principal: AnalyticsPrincipal,
  ): Promise<{ tenantId: string; status: string; created: boolean }> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const inserted = await client.query(
        `INSERT INTO gigalibs_analytics.tenant_analytics_configs
           (tenant_id, refresh_cadence_minutes, lineage_verification_enabled, initialized_at, updated_at)
         VALUES ($1, 60, TRUE, NOW(), NOW())
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING tenant_id`,
        [tenantId],
      );
      const created = inserted.rowCount === 1;

      return {
        tenantId,
        status: 'READY',
        created,
      };
    });
  }
}
