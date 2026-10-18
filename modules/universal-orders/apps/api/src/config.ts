import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const AUDIENCE = 'gigalibs-universal-orders-api';
export const MODULE_KEY = 'universal-orders';
export const PERMISSION_PREFIX = 'orders';
export const SCHEMA = 'gigalibs_orders';
export const TOPIC = 'universal-orders.facts.v1';
export const SCHEMA_CONTRACT_VERSION = 4;
export const RUNTIME_CONFIG = Symbol('UNIVERSAL_ORDERS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'UNIVERSAL_ORDERS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
