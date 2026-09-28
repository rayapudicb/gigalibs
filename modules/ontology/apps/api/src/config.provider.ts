import { type FactoryProvider } from '@nestjs/common';
import { loadRuntimeConfig, type OntologyRuntimeConfig } from './runtime-config.js';

export const ONTOLOGY_CONFIG = 'ONTOLOGY_CONFIG';

export const configProvider: FactoryProvider<OntologyRuntimeConfig> = {
  provide: ONTOLOGY_CONFIG,
  useFactory: (): OntologyRuntimeConfig => loadRuntimeConfig(),
};
