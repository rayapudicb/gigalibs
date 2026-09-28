import type { Provider } from '@nestjs/common';
import { type EsignRuntimeConfig, loadRuntimeConfig } from './runtime-config.js';

export const ESIGN_CONFIG = Symbol('ESIGN_CONFIG');

export const ConfigProvider: Provider = {
  provide: ESIGN_CONFIG,
  useFactory: (): EsignRuntimeConfig => loadRuntimeConfig(),
};
