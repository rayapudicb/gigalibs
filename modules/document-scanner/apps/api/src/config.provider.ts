import { type FactoryProvider } from '@nestjs/common';
import { loadRuntimeConfig, type ScannerRuntimeConfig } from './runtime-config.js';

export const SCANNER_CONFIG = 'SCANNER_CONFIG';

export const configProvider: FactoryProvider<ScannerRuntimeConfig> = {
  provide: SCANNER_CONFIG,
  useFactory: (): ScannerRuntimeConfig => loadRuntimeConfig(),
};
