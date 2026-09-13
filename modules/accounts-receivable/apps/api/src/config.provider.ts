import type { Provider } from '@nestjs/common';
import { type ArRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const AR_CONFIG = Symbol('AR_CONFIG');

export const arConfigProvider: Provider<ArRuntimeConfig> = {
  provide: AR_CONFIG,
  useFactory: () => loadRuntimeConfig(),
};
