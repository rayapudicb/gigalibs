import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const AUDIENCE = 'gigalibs-universal-inventory-api';
export const MODULE_KEY = 'universal-inventory';
export const PERMISSION_PREFIX = 'inventory';
export const SCHEMA = 'gigalibs_inventory';
export const TOPIC = 'universal-inventory.facts.v1';
export const SCHEMA_CONTRACT_VERSION = 3;
export const RUNTIME_CONFIG = Symbol('UNIVERSAL_INVENTORY_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'UNIVERSAL_INVENTORY',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
