import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const MODULE_KEY = 'gigalibs-assistant';
export const AUDIENCE = 'gigalibs-assistant-api';
export const SCHEMA = 'gigalibs_assistant';
export const RUNTIME_CONFIG = Symbol('GIGALIBS_ASSISTANT_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () => loadModuleRuntimeConfig({
    prefix: 'GIGALIBS_ASSISTANT',
    audience: AUDIENCE,
    schemaContractVersion: 1,
  }),
};
