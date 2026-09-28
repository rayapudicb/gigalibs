import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { SpendPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class SetupService {
  constructor(private readonly db: DatabaseService) {}

  async status(principal: SpendPrincipal) {
    const identity = await this.db.getPool().query<{
      oidc_issuer: string;
      external_tenant_subject: string;
      status: string;
    }>(
      `SELECT oidc_issuer, external_tenant_subject, status
       FROM gigalibs_spend.module_tenants WHERE id = $1::uuid`,
      [principal.tenantId],
    );
    const row = identity.rows[0];
    if (!row) throw new NotFoundException('Spend module has not been configured for this tenant.');
    if (
      row.oidc_issuer !== principal.issuer ||
      row.external_tenant_subject !== principal.tenantId
    ) {
      throw new ConflictException('Verified tenant identity conflicts with existing Spend setup.');
    }
    return { tenantId: principal.tenantId, status: row.status };
  }

  async configure(principal: SpendPrincipal) {
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_spend.module_tenants (id, oidc_issuer, external_tenant_subject)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [principal.tenantId, principal.issuer, principal.tenantId],
      );
      const identity = await client.query<{
        oidc_issuer: string;
        external_tenant_subject: string;
        status: string;
      }>(
        `SELECT oidc_issuer, external_tenant_subject, status
         FROM gigalibs_spend.module_tenants WHERE id = $1::uuid`,
        [principal.tenantId],
      );
      const row = identity.rows[0];
      if (
        !row ||
        row.oidc_issuer !== principal.issuer ||
        row.external_tenant_subject !== principal.tenantId
      ) {
        throw new ConflictException('Verified tenant identity conflicts with existing Spend setup.');
      }
      if (row.status !== 'ACTIVE') {
        throw new ConflictException(`Spend tenant is ${row.status}.`);
      }
      if (inserted.rowCount === 1) {
        await client.query(
          `INSERT INTO gigalibs_spend.audit_events (
             tenant_id, id, entity_type, entity_id, action, actor_id, actor_role, details
           ) VALUES ($1::uuid, $2::uuid, 'MODULE_TENANT', $3::uuid, 'SETUP', $4, 'PLATFORM_UAT_OPERATOR', $5::jsonb)`,
          [
            principal.tenantId,
            randomUUID(),
            principal.tenantId,
            principal.subject,
            JSON.stringify({ issuer: principal.issuer, outcome: 'ACTIVE' }),
          ],
        );
      }
      return { tenantId: principal.tenantId, status: row.status, created: inserted.rowCount === 1 };
    });
  }
}
