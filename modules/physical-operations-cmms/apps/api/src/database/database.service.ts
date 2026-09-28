import { ModuleDatabase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { CMMS_CONFIG } from '../config.provider.js';
import type { CmmsRuntimeConfig } from '../runtime-config.js';

export type { TenantTransaction } from '@gigalibs/module-sdk';

type CmmsDefinerFunction =
  | 'relay_lease_workforce_events'
  | 'relay_settle_workforce_event'
  | 'outbox_sweep';

/**
 * Canonical CMMS PostgreSQL runtime (WI-OI-038) on the module SDK (WI-OI-082). Every statement runs inside a
 * transaction bound to the verified tenant through `app.tenant_id`, which the forced RLS policies of every table
 * evaluate. The runtime role must not be superuser or BYPASSRLS, and the schema must be exactly at the image's
 * contract version. The outbox relay definer functions (WI-OI-068) are the only cross-tenant access.
 */
@Injectable()
export class DatabaseService extends ModuleDatabase<CmmsDefinerFunction> {
  constructor(@Inject(CMMS_CONFIG) config: CmmsRuntimeConfig) {
    super({
      label: 'CMMS',
      schema: 'gigalibs_cmms',
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: [
        'relay_lease_workforce_events',
        'relay_settle_workforce_event',
        'outbox_sweep',
      ],
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-cmms-api' },
    });
  }
}
