import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

export const PROJECT_DEFINER_FUNCTIONS = [
  'relay_lease_project_finance_events',
  'relay_lease_project_ar_events',
  'relay_settle_project_event',
] as const;

export type ProjectDefinerFunction = (typeof PROJECT_DEFINER_FUNCTIONS)[number];

/**
 * Project Operations PostgreSQL runtime on the module SDK: every statement runs in a transaction bound to the verified tenant
 * through `app.tenant_id`, which the forced RLS policies evaluate. The runtime role must not be superuser or
 * BYPASSRLS, and the schema must be exactly at the image's contract version.
 */
@Injectable()
export class DatabaseService extends ModuleDatabase<ProjectDefinerFunction> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Project Operations',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: PROJECT_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-project-operations-api' },
    });
  }
}
