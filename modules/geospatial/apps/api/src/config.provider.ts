import type { Provider } from '@nestjs/common';
import { loadGeospatialRuntimeConfig, type GeospatialRuntimeConfig } from './runtime-config.js';

export const GEOSPATIAL_CONFIG = Symbol('GEOSPATIAL_CONFIG');

export const GeospatialConfigProvider: Provider = {
  provide: GEOSPATIAL_CONFIG,
  useFactory: (): GeospatialRuntimeConfig => loadGeospatialRuntimeConfig(),
};
