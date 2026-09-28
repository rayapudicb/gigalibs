import type { Provider } from '@nestjs/common';
import { type TaxRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const TAX_CONFIG = Symbol('TAX_CONFIG');

export const taxConfigProvider: Provider<TaxRuntimeConfig> = {
  provide: TAX_CONFIG,
  useFactory: () => loadRuntimeConfig(),
};
