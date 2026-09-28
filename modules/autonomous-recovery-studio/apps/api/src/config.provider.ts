import { Provider } from '@nestjs/common';
import { loadRuntimeConfig, RecoveryRuntimeConfig } from './runtime-config.js';

export const RECOVERY_CONFIG = Symbol('RECOVERY_CONFIG');

export const ConfigProvider: Provider = {
  provide: RECOVERY_CONFIG,
  useFactory: (): RecoveryRuntimeConfig => {
    return loadRuntimeConfig();
  },
};
