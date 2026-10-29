import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

export const RETURNS_DEFINER_FUNCTIONS = [
  'relay_lease_returns_orders_events',
  'relay_lease_returns_finance_events',
  'relay_settle_returns_event',
] as const;

export type ReturnsDefinerFunction = (typeof RETURNS_DEFINER_FUNCTIONS)[number];

/**
 * Returns and RMA PostgreSQL runtime on the module SDK: every statement runs in a transaction bound to the verified tenant
 * through `app.tenant_id`, which the forced RLS policies evaluate. The runtime role must not be superuser or
 * BYPASSRLS, and the schema must be exactly at the image's contract version.
 */
@Injectable()
export class DatabaseService extends ModuleDatabase<ReturnsDefinerFunction> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Returns and RMA',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: RETURNS_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-universal-returns-api' },
    });
  }
}
