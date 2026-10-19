import { loadModuleRuntimeConfig, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Issuer stored on `module_tenants.oidc_issuer` for suite platform-context callers. */
export const AR_PLATFORM_CONTEXT_ISSUER = 'urn:gigalibs:platform-context:v1';

export const AUDIENCE = 'gigalibs-ar-api';
export const MODULE_KEY = 'accounts-receivable';
export const PERMISSION_PREFIX = 'ar';
export const SCHEMA = 'gigalibs_ar';
export const SCHEMA_CONTRACT_VERSION = 15;

export const AR_MODULE_RUNTIME_CONFIG = Symbol('AR_MODULE_RUNTIME_CONFIG');

export const arModuleRuntimeConfigProvider: Provider<ModuleRuntimeConfig | null> = {
  provide: AR_MODULE_RUNTIME_CONFIG,
  useFactory: (): ModuleRuntimeConfig | null => {
    if (!process.env.AR_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64?.trim()) return null;
    return loadModuleRuntimeConfig({
      prefix: 'AR',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    });
  },
};
