import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs Manufacturing & MRP platform contexts for. */
export const AUDIENCE = 'gigalibs-universal-manufacturing-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'universal-manufacturing';
/** `universal-manufacturing:*` grants every `universal-manufacturing.<area>.<action>` permission. */
export const PERMISSION_PREFIX = 'universal-manufacturing';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_universal_manufacturing';
/** Outbox topic of this module's facts. */
export const TOPIC = 'universal-manufacturing.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 4;

export const RUNTIME_CONFIG = Symbol('UNIVERSAL_MANUFACTURING_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'UNIVERSAL_MANUFACTURING',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
