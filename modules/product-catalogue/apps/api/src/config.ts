import { type ModuleRuntimeConfig, loadModuleRuntimeConfig } from '@gigalibs/module-sdk';
import type { Provider } from '@nestjs/common';

export const AUDIENCE = 'gigalibs-product-catalogue-api';
export const MODULE_KEY = 'product-catalogue';
export const PERMISSION_PREFIX = 'products';
export const SCHEMA = 'gigalibs_product_catalogue';
export const TOPIC = 'product-catalogue.facts.v1';
export const SCHEMA_CONTRACT_VERSION = 2;
export const RUNTIME_CONFIG = Symbol('PRODUCT_CATALOGUE_RUNTIME_CONFIG');

export const runtimeConfigProvider: Provider<ModuleRuntimeConfig> = {
  provide: RUNTIME_CONFIG,
  useFactory: () => loadModuleRuntimeConfig({ prefix: 'PRODUCT_CATALOGUE', audience: AUDIENCE, schemaContractVersion: SCHEMA_CONTRACT_VERSION }),
};
