import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const AUDIENCE = 'gigalibs-universal-procurement-api';
export const MODULE_KEY = 'universal-procurement';
export const PERMISSION_PREFIX = 'procurement';
export const SCHEMA = 'gigalibs_procurement';
export const TOPIC = 'universal-procurement.facts.v1';
export const SCHEMA_CONTRACT_VERSION = 2;
export const RUNTIME_CONFIG = Symbol('UNIVERSAL_PROCUREMENT_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'UNIVERSAL_PROCUREMENT',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
