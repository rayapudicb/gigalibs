import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { CurrencyPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly db: DatabaseService) {}

  async getStatus(
    tenantId: string,
  ): Promise<{ configured: boolean; tenantId: string; functionalCurrency?: string }> {
    const res = await this.db.query(
      `SELECT tenant_id, functional_currency FROM gigalibs_currency.tenant_currency_preferences WHERE tenant_id = $1 LIMIT 1;`,
      [tenantId],
    );
    if (res.rows.length === 0) {
      return { configured: false, tenantId };
    }
    return {
      configured: true,
      tenantId: res.rows[0].tenant_id,
      functionalCurrency: res.rows[0].functional_currency,
    };
  }

  async setupTenant(
    tenantId: string,
    principal: CurrencyPrincipal,
    correlationId?: string,
  ): Promise<{ tenantId: string; status: string; created: boolean }> {
    return this.db.transaction(async (client) => {
      const existing = await client.query(
        `SELECT tenant_id FROM gigalibs_currency.tenant_currency_preferences WHERE tenant_id = $1;`,
        [tenantId],
      );

      let created = false;
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO gigalibs_currency.tenant_currency_preferences
           (tenant_id, functional_currency, presentation_currency, default_locale, auto_convert_foreign_invoices, updated_at)
           VALUES ($1, 'USD', 'USD', 'en-US', TRUE, NOW())
           ON CONFLICT (tenant_id) DO NOTHING;`,
          [tenantId],
        );
        created = true;
      }

      await client.query(
        `INSERT INTO gigalibs_currency.audit_events
         (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'TENANT_SETUP', $3, 'INITIALIZE', $4, NOW());`,
        [
          `aud-setup-${randomUUID()}`,
          tenantId,
          tenantId,
          JSON.stringify({
            subject: principal.subject,
            issuer: principal.issuer,
            correlationId,
            created,
            pairsConfigured: 0,
            authoritativeRateSourceRequired: true,
          }),
        ],
      );

      this.logger.log(`Tenant ${tenantId} initialized without synthetic currency rates.`);
      return { tenantId, status: 'ACTIVE', created };
    });
  }
}
