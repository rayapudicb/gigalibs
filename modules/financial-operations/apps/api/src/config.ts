import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const AUDIENCE = 'gigalibs-financial-operations-api';
export const MODULE_KEY = 'financial-operations';
export const PERMISSION_PREFIX = 'finance';
export const SCHEMA = 'gigalibs_finance';
export const TOPIC = 'financial-operations.facts.v1';
export const SCHEMA_CONTRACT_VERSION = 11;
export const RUNTIME_CONFIG = Symbol('FINANCIAL_OPERATIONS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'FINANCIAL_OPERATIONS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
