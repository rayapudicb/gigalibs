import { ModuleDatabase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { GIGAOPS_CONFIG } from '../config.provider.js';
import type { GigaOpsRuntimeConfig } from '../runtime-config.js';

type WorkforceDefinerFunction =
  | 'relay_lease_cmms_events'
  | 'relay_settle_cmms_event'
  | 'outbox_sweep';

/**
 * Canonical Workforce PostgreSQL runtime on the module SDK (WI-OI-082). Every tenant statement runs in a
 * transaction bound to the verified tenant (`app.tenant_id` and the search path in one round trip). The relay
 * definer functions (WI-OI-068) are the only cross-tenant access and only lease or settle handshake rows.
 */
@Injectable()
export class WorkforceDatabaseService extends ModuleDatabase<WorkforceDefinerFunction> {
  constructor(@Inject(GIGAOPS_CONFIG) config: GigaOpsRuntimeConfig) {
    super({
      label: 'Workforce',
      schema: 'gigalibs_workforce',
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: ['relay_lease_cmms_events', 'relay_settle_cmms_event', 'outbox_sweep'],
      tenantBinding: 'set-config',
    });
  }
}
