import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

export const MANUFACTURING_DEFINER_FUNCTIONS = [
  'relay_lease_manufacturing_events',
  'relay_settle_manufacturing_event',
] as const;

export type ManufacturingDefinerFunction = (typeof MANUFACTURING_DEFINER_FUNCTIONS)[number];

/**
 * Manufacturing & MRP PostgreSQL runtime on the module SDK: every statement runs in a transaction bound to the verified tenant
 * through `app.tenant_id`, which the forced RLS policies evaluate. The runtime role must not be superuser or
 * BYPASSRLS, and the schema must be exactly at the image's contract version.
 */
@Injectable()
export class DatabaseService extends ModuleDatabase<ManufacturingDefinerFunction> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Manufacturing & MRP',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: MANUFACTURING_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-universal-manufacturing-api' },
    });
  }
}
