import type { Provider } from '@nestjs/common';
import {
  loadGigaOpsRuntimeConfig,
  type GigaOpsRuntimeConfig,
} from './runtime-config.js';

export const GIGAOPS_CONFIG = Symbol('GIGAOPS_CONFIG');

export const GigaOpsConfigProvider: Provider = {
  provide: GIGAOPS_CONFIG,
  useFactory: (): GigaOpsRuntimeConfig => loadGigaOpsRuntimeConfig(),
};
