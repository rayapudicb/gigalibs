import { ModuleDatabase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { IOT_CONFIG } from '../config.provider.js';
import type { IotRuntimeConfig } from '../runtime-config.js';

type IotDefinerFunction = 'relay_lease_cmms_events' | 'relay_settle_cmms_event';

@Injectable()
export class DatabaseService extends ModuleDatabase<IotDefinerFunction> {
  constructor(@Inject(IOT_CONFIG) config: IotRuntimeConfig) {
    super({
      label: 'IoT Gateway',
      schema: 'gigalibs_iot',
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: ['relay_lease_cmms_events', 'relay_settle_cmms_event'],
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-iot-api' },
    });
  }
}
