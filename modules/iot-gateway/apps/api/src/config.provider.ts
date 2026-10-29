import type { Provider } from '@nestjs/common';
import { type IotRuntimeConfig, loadIotRuntimeConfig } from './runtime-config.js';

export const IOT_CONFIG = Symbol('IOT_CONFIG');

export const iotConfigProvider: Provider<IotRuntimeConfig> = {
  provide: IOT_CONFIG,
  useFactory: () => loadIotRuntimeConfig(),
};
