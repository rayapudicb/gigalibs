import type { Provider } from '@nestjs/common';
import { type CurrencyRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const CURRENCY_CONFIG = Symbol('CURRENCY_CONFIG');

export const currencyConfigProvider: Provider<CurrencyRuntimeConfig> = {
  provide: CURRENCY_CONFIG,
  useFactory: () => loadRuntimeConfig(),
};
