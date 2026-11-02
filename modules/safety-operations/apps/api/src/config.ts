import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs Safety Operations platform contexts for. */
export const AUDIENCE = 'gigalibs-safety-operations-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'safety-operations';
/** `safety-operations:*` grants every `safety-operations.<area>.<action>` permission. */
export const PERMISSION_PREFIX = 'safety-operations';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_safety_operations';
/** Outbox topic of this module's facts. */
export const TOPIC = 'safety-operations.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 3;

export const RUNTIME_CONFIG = Symbol('SAFETY_OPERATIONS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'SAFETY_OPERATIONS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
