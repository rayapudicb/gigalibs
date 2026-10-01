import { Module } from '@nestjs/common';
import { GeospatialAuthorizationGuard } from './auth/authorization.js';
import { GeospatialConfigProvider } from './config.provider.js';
import { GeospatialDatabaseService } from './database/database.service.js';
import { GeospatialHealthController } from './health/health.controller.js';
import { SpatialNodeTypesController, SpatialNodesController } from './places/places.controller.js';
import { PlacesService } from './places/places.service.js';
import { GeospatialRuntimeController } from './runtime/runtime.controller.js';
import { HubPlacesInboxController, HubPlacesInboxGuard, HubPlacesInboxService } from './inbox/hub-places-inbox.js';
import { GeospatialPackController } from './pack/pack.controller.js';
import { GeospatialPackService } from './pack/pack.service.js';
import { GEOSPATIAL_RELAY_PROVIDERS } from './relay/analytics-relay.js';

@Module({
  controllers: [
    GeospatialHealthController,
    GeospatialRuntimeController,
    SpatialNodeTypesController,
    SpatialNodesController,
    HubPlacesInboxController,
    GeospatialPackController,
  ],
  providers: [GeospatialConfigProvider, GeospatialDatabaseService, GeospatialAuthorizationGuard, PlacesService, ...GEOSPATIAL_RELAY_PROVIDERS, HubPlacesInboxGuard, HubPlacesInboxService, GeospatialPackService],
})
export class GeospatialModule {}
