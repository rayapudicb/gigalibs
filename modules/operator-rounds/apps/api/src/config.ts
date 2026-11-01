import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs Operator Inspection Rounds platform contexts for. */
export const AUDIENCE = 'gigalibs-operator-rounds-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'operator-rounds';
/** `operator-rounds:*` grants every `operator-rounds.<area>.<action>` permission. */
export const PERMISSION_PREFIX = 'operator-rounds';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_operator_rounds';
/** Outbox topic of this module's facts. */
export const TOPIC = 'operator-rounds.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 8;

export const RUNTIME_CONFIG = Symbol('OPERATOR_ROUNDS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'OPERATOR_ROUNDS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
