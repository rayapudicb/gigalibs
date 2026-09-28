import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { RecoveryPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly db: DatabaseService) {}

  async getStatus(
    tenantId: string,
  ): Promise<{ configured: boolean; tenantId: string; initializedAt?: string }> {
    const result = await this.db.query(
      `SELECT tenant_id, initialized_at
       FROM gigalibs_recovery.tenant_recovery_configs
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
    principal: RecoveryPrincipal,
    correlationId?: string,
  ): Promise<{ tenantId: string; status: string; created: boolean; seededCases: 0 }> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const inserted = await client.query(
        `INSERT INTO gigalibs_recovery.tenant_recovery_configs
           (tenant_id, scanner_enabled, auto_hold_confidence_threshold,
            sla_guarantee_enabled, initialized_at, updated_at)
         VALUES ($1, FALSE, 95.00, FALSE, NOW(), NOW())
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING tenant_id`,
        [tenantId],
      );
      const created = inserted.rowCount === 1;

      // Record setup audit event
      await client.query(
        `INSERT INTO gigalibs_recovery.audit_events
           (id, tenant_id, event_type, entity_type, entity_id, payload, performed_by, created_at)
         VALUES ($1, $2, 'TENANT_INITIALIZATION', 'tenant_recovery_configs', $3, $4, $5, NOW())`,
        [
          `aud-setup-${randomUUID()}`,
          tenantId,
          tenantId,
          JSON.stringify({
            subject: principal.subject,
            issuer: principal.issuer,
            correlationId,
            created,
            initializedCases: 0,
            sourceRequired: true,
          }),
          principal.subject,
        ],
      );

      this.logger.log(`Tenant ${tenantId} bound without synthetic recovery cases.`);
      return { tenantId, status: 'ACTIVE', created, seededCases: 0 };
    });
  }
}
