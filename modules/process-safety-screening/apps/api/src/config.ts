import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs SPEED Process Safety Screening platform contexts for. */
export const AUDIENCE = 'gigalibs-process-safety-screening-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'process-safety-screening';
/** `speed:*` grants every `speed.<area>.<action>` permission (plan v1.4 §3.2). */
export const PERMISSION_PREFIX = 'speed';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_speed';
/** Outbox topic of this module's facts. */
export const TOPIC = 'speed.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 4;

export const RUNTIME_CONFIG = Symbol('SPEED_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'SPEED',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
