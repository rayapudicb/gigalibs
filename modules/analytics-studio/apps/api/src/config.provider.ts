import type { Provider } from '@nestjs/common';
import { type AnalyticsRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const ANALYTICS_CONFIG = Symbol('ANALYTICS_CONFIG');

export const ConfigProvider: Provider = {
  provide: ANALYTICS_CONFIG,
  useFactory: (): AnalyticsRuntimeConfig => loadRuntimeConfig(),
};
