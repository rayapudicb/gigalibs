import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface TenantPreferences {
  tenantId: string;
  functionalCurrency: string;
  presentationCurrency: string;
  defaultLocale: string;
  autoConvertForeignInvoices: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(private readonly db: DatabaseService) {}

  async getPreferences(tenantId: string): Promise<TenantPreferences> {
    const res = await this.db.query(
      `SELECT tenant_id, functional_currency, presentation_currency, default_locale, 
              auto_convert_foreign_invoices, created_at, updated_at
       FROM gigalibs_currency.tenant_currency_preferences
       WHERE tenant_id = $1 LIMIT 1;`,
      [tenantId],
    );

    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        tenantId: r.tenant_id,
        functionalCurrency: r.functional_currency,
        presentationCurrency: r.presentation_currency,
        defaultLocale: r.default_locale,
        autoConvertForeignInvoices: r.auto_convert_foreign_invoices,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }

    return {
      tenantId,
      functionalCurrency: 'USD',
      presentationCurrency: 'USD',
      defaultLocale: 'en-US',
      autoConvertForeignInvoices: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async updatePreferences(
    tenantId: string,
    prefs: Partial<TenantPreferences>,
  ): Promise<TenantPreferences> {
    const res = await this.db.query(
      `INSERT INTO gigalibs_currency.tenant_currency_preferences
       (tenant_id, functional_currency, presentation_currency, default_locale, auto_convert_foreign_invoices, updated_at)
       VALUES ($1, COALESCE($2, 'USD'), COALESCE($3, 'USD'), COALESCE($4, 'en-US'), COALESCE($5, TRUE), NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         functional_currency = COALESCE($2, gigalibs_currency.tenant_currency_preferences.functional_currency),
         presentation_currency = COALESCE($3, gigalibs_currency.tenant_currency_preferences.presentation_currency),
         default_locale = COALESCE($4, gigalibs_currency.tenant_currency_preferences.default_locale),
         auto_convert_foreign_invoices = COALESCE($5, gigalibs_currency.tenant_currency_preferences.auto_convert_foreign_invoices),
         updated_at = NOW()
       RETURNING *;`,
      [
        tenantId,
        prefs.functionalCurrency,
        prefs.presentationCurrency,
        prefs.defaultLocale,
        prefs.autoConvertForeignInvoices,
      ],
    );

    const r = res.rows[0];
    return {
      tenantId: r.tenant_id,
      functionalCurrency: r.functional_currency,
      presentationCurrency: r.presentation_currency,
      defaultLocale: r.default_locale,
      autoConvertForeignInvoices: r.auto_convert_foreign_invoices,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
