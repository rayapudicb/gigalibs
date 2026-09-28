import type { Provider } from '@nestjs/common';
import { type SpendRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const SPEND_CONFIG = Symbol('SPEND_CONFIG');

export const spendConfigProvider: Provider<SpendRuntimeConfig> = {
  provide: SPEND_CONFIG,
  useFactory: () => loadRuntimeConfig(),
};
