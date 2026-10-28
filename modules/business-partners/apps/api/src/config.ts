import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

/** Audience the web BFF signs Universal Business Partner platform contexts for. */
export const AUDIENCE = 'gigalibs-business-partners-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const MODULE_KEY = 'business-partners';
/** `business-partners:*` grants every `business-partners.<area>.<action>` permission. */
export const PERMISSION_PREFIX = 'business-partners';
/** The schema this module owns; every table has forced RLS on `app.tenant_id`. */
export const SCHEMA = 'gigalibs_business_partners';
/** Outbox topic of this module's facts. */
export const TOPIC = 'business-partners.facts.v1';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const SCHEMA_CONTRACT_VERSION = 4;

export const RUNTIME_CONFIG = Symbol('BUSINESS_PARTNERS_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () =>
    loadModuleRuntimeConfig({
      prefix: 'BUSINESS_PARTNERS',
      audience: AUDIENCE,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    }),
};
