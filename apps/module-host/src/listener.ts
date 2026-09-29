import { type ModuleListenerConfig, loadModuleListenerConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const HOST_LISTENER = Symbol('MODULE_HOST_LISTENER');

/** The host listens on `MODULE_HOST_API_HOST`, `MODULE_HOST_API_PORT` and `MODULE_HOST_CORS_ORIGINS`. */
export const hostListenerProvider: Provider<ModuleListenerConfig> = {
  provide: HOST_LISTENER,
  useFactory: () => loadModuleListenerConfig({ prefix: 'MODULE_HOST' }),
};
