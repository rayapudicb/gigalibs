import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG, SCHEMA } from './config.js';

export const ORDERS_DEFINER_FUNCTIONS = [
  'relay_lease_orders_events',
  'relay_settle_orders_event',
] as const;

export type OrdersDefinerFunction = (typeof ORDERS_DEFINER_FUNCTIONS)[number];

@Injectable()
export class DatabaseService extends ModuleDatabase<OrdersDefinerFunction> {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig) {
    super({
      label: 'Universal Orders',
      schema: SCHEMA,
      databaseUrl: config.databaseUrl,
      poolSize: config.databasePoolSize,
      expectedMigrationVersion: config.expectedMigrationVersion,
      definerFunctions: ORDERS_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-universal-orders-api' },
    });
  }
}
