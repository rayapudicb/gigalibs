import { Module } from '@nestjs/common';
import { DatasetModule } from '../datasets/dataset.module.js';
import { QueryEngineModule } from '../query-engine/query-engine.module.js';
import { SchemaDiscoveryModule } from '../schema-discovery/schema-discovery.module.js';
import { PlaceAnalyticsController } from './place-analytics.controller.js';
import { PlaceAnalyticsService } from './place-analytics.service.js';

@Module({
  imports: [SchemaDiscoveryModule, DatasetModule, QueryEngineModule],
  // WI-OI-120ak (S5, D5a): the Demo Lab's synthetic data endpoints are removed.
  controllers: [PlaceAnalyticsController],
  providers: [PlaceAnalyticsService],
  exports: [PlaceAnalyticsService],
})
export class PlaceAnalyticsModule {}
