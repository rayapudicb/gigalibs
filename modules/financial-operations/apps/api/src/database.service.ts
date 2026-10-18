import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

export const FINANCE_DEFINER_FUNCTIONS = [
  'relay_lease_finance_events',
  'relay_settle_finance_event',
  'list_inventory_receipt_posting_reconciliation_tenants',
] as const;

export type FinanceDefinerFunction = (typeof FINANCE_DEFINER_FUNCTIONS)[number];

@Injectable()
export class DatabaseService extends ModuleDatabase<FinanceDefinerFunction> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Financial Operations',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: FINANCE_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-financial-operations-api' },
    });
  }
}
