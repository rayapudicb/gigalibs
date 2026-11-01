import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

/**
 * Operator Inspection Rounds PostgreSQL runtime on the module SDK: every statement runs in a transaction bound to the verified tenant
 * through `app.tenant_id`, which the forced RLS policies evaluate. The runtime role must not be superuser or
 * BYPASSRLS, and the schema must be exactly at the image's contract version.
 */
@Injectable()
export class DatabaseService extends ModuleDatabase<'relay_lease_cmms_events'|'relay_lease_analytics_events'|'relay_settle_analytics_event'> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Operator Inspection Rounds',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: ['relay_lease_cmms_events','relay_lease_analytics_events','relay_settle_analytics_event'],
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-operator-rounds-api' },
    });
  }
}
