import { type FactoryProvider } from '@nestjs/common';
import { loadRuntimeConfig, type SagaRuntimeConfig } from './runtime-config.js';

export const SAGA_CONFIG = 'SAGA_CONFIG';

export const configProvider: FactoryProvider<SagaRuntimeConfig> = {
  provide: SAGA_CONFIG,
  useFactory: (): SagaRuntimeConfig => loadRuntimeConfig(),
};
