import type { Provider } from '@nestjs/common';
import { type CmmsRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const CMMS_CONFIG = Symbol('CMMS_CONFIG');

export const cmmsConfigProvider: Provider<CmmsRuntimeConfig> = {
  provide: CMMS_CONFIG,
  useFactory: () => loadRuntimeConfig(),
};
