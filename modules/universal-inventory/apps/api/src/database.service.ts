import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

export const INVENTORY_DEFINER_FUNCTIONS = [
  'relay_lease_inventory_events',
  'relay_settle_inventory_event',
] as const;

export type InventoryDefinerFunction = (typeof INVENTORY_DEFINER_FUNCTIONS)[number];

@Injectable()
export class DatabaseService extends ModuleDatabase<InventoryDefinerFunction> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Universal Inventory',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: INVENTORY_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-universal-inventory-api' },
    });
  }
}
