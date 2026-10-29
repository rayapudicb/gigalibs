import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs Project Operations platform contexts for. */
export const AUDIENCE = 'gigalibs-project-operations-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'project-operations';
/** `project-operations:*` grants every `project-operations.<area>.<action>` permission. */
export const PERMISSION_PREFIX = 'project-operations';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_project_operations';
/** Outbox topic of this module's facts. */
export const TOPIC = 'project-operations.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 1;

export const RUNTIME_CONFIG = Symbol('PROJECT_OPERATIONS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'PROJECT_OPERATIONS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
