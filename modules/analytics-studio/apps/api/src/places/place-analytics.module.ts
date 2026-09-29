import { Module } from '@nestjs/common';
import { DatasetModule } from '../datasets/dataset.module.js';
import { QueryEngineModule } from '../query-engine/query-engine.module.js';
import { SchemaDiscoveryModule } from '../schema-discovery/schema-discovery.module.js';
import { DemoLabController, PlaceAnalyticsController } from './place-analytics.controller.js';
import { DemoLabService } from './demo-lab.service.js';
import { PlaceAnalyticsService } from './place-analytics.service.js';
import { SampleFarmService } from './sample-farm.service.js';

@Module({
  imports: [SchemaDiscoveryModule, DatasetModule, QueryEngineModule],
  controllers: [PlaceAnalyticsController, DemoLabController],
  providers: [PlaceAnalyticsService, DemoLabService, SampleFarmService],
})
export class PlaceAnalyticsModule {}
