import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

@Injectable()
export class DatabaseService extends ModuleDatabase {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'GigaLibs Assistant',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: [],
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 10_000, application_name: 'gigalibs-assistant-api' },
    });
  }
}
