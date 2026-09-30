import { ConnectorHubInboxModule } from './inbox/connector-hub-inbox.js';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { MetricsService } from './metrics/metrics.service.js';
import { ActionsController } from './actions/actions.controller.js';
import { ActionsService } from './actions/actions.service.js';
import { SchemaDiscoveryModule } from './schema-discovery/schema-discovery.module.js';
import { DatasetModule } from './datasets/dataset.module.js';
import { QueryEngineModule } from './query-engine/query-engine.module.js';
import { ReportModule } from './reports/report.module.js';
import { LineageModule } from './lineage/lineage.module.js';
import { PlaceAnalyticsModule } from './places/place-analytics.module.js';
import { AnalyticsRuntimeModule } from './runtime.module.js';

@Module({
  imports: [
    AnalyticsRuntimeModule,
    SchemaDiscoveryModule,
    DatasetModule,
    QueryEngineModule,
    ReportModule,
    LineageModule,
    PlaceAnalyticsModule,
    ConnectorHubInboxModule,
  ],
  controllers: [
    HealthController,
    SetupController,
    MetricsController,
    ActionsController,
  ],
  providers: [
    SetupService,
    MetricsService,
    ActionsService,
  ],
  exports: [
    SetupService,
    MetricsService,
    ActionsService,
  ],
})
export class AppModule {}
