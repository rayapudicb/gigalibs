import { Module } from '@nestjs/common';
import { GeospatialAuthorizationGuard } from './auth/authorization.js';
import { GeospatialConfigProvider } from './config.provider.js';
import { GeospatialDatabaseService } from './database/database.service.js';
import { GeospatialHealthController } from './health/health.controller.js';
import { SpatialNodeTypesController, SpatialNodesController } from './places/places.controller.js';
import { PlacesService } from './places/places.service.js';
import { GeospatialRuntimeController } from './runtime/runtime.controller.js';

@Module({
  controllers: [
    GeospatialHealthController,
    GeospatialRuntimeController,
    SpatialNodeTypesController,
    SpatialNodesController,
  ],
  providers: [GeospatialConfigProvider, GeospatialDatabaseService, GeospatialAuthorizationGuard, PlacesService],
})
export class GeospatialModule {}
