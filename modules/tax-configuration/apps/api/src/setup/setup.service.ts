import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TaxPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SetupService {
  constructor(private readonly db: DatabaseService) {}

  async status(principal: TaxPrincipal) {
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const identity = await client.query<{
        oidc_issuer: string;
        external_tenant_subject: string;
        status: string;
      }>(
        `SELECT oidc_issuer, external_tenant_subject, status
         FROM gigalibs_tax.module_tenants WHERE id = $1`,
        [principal.tenantId],
      );
      const row = identity.rows[0];
      if (!row) throw new NotFoundException('Tax module has not been configured for this tenant.');
      this.assertIdentity(principal, row);
      return { tenantId: principal.tenantId, status: row.status };
    });
  }

  async configure(principal: TaxPrincipal) {
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_tax.module_tenants (id, oidc_issuer, external_tenant_subject)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [principal.tenantId, principal.issuer, principal.tenantId],
      );
      const identity = await client.query<{
        oidc_issuer: string;
        external_tenant_subject: string;
        status: string;
      }>(
        `SELECT oidc_issuer, external_tenant_subject, status
         FROM gigalibs_tax.module_tenants WHERE id = $1`,
        [principal.tenantId],
      );
      const row = identity.rows[0];
      if (!row) throw new ConflictException('Tax tenant setup did not persist.');
      this.assertIdentity(principal, row);
      if (row.status !== 'ACTIVE') throw new ConflictException(`Tax tenant is ${row.status}.`);
      if (inserted.rowCount === 1) {
        await client.query(
          `INSERT INTO gigalibs_tax.audit_events
             (id, tenant_id, entity_type, entity_id, action, actor_id, actor_email, payload)
           VALUES ($1, $2, 'MODULE_TENANT', $2, 'SETUP', $3, $3, $4::jsonb)`,
          [
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

  private assertIdentity(
    principal: TaxPrincipal,
    row: { oidc_issuer: string; external_tenant_subject: string },
  ) {
    if (row.oidc_issuer !== principal.issuer || row.external_tenant_subject !== principal.tenantId) {
      throw new ConflictException('Verified tenant identity conflicts with existing Tax setup.');
    }
  }
}
