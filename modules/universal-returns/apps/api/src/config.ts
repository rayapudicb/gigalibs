import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs Returns and RMA platform contexts for. */
export const AUDIENCE = 'gigalibs-universal-returns-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'universal-returns';
/** `universal-returns:*` grants every `universal-returns.<area>.<action>` permission. */
export const PERMISSION_PREFIX = 'universal-returns';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_universal_returns';
/** Outbox topic of this module's facts. */
export const TOPIC = 'universal-returns.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 4;

export const RUNTIME_CONFIG = Symbol('UNIVERSAL_RETURNS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'UNIVERSAL_RETURNS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
