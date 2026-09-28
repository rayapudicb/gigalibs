import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { MetricsService } from './metrics/metrics.service.js';
import { TelemetryService } from './metrics/telemetry.service.js';
import { ActionsController } from './actions/actions.controller.js';
import { ActionsService } from './actions/actions.service.js';
import { ConnectorModule } from './connectors/connector.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
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
    ConnectorModule,
    IngestionModule,
    SchemaDiscoveryModule,
    DatasetModule,
    QueryEngineModule,
    ReportModule,
    LineageModule,
    PlaceAnalyticsModule,
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
    TelemetryService,
    ActionsService,
  ],
  exports: [
    SetupService,
    MetricsService,
    TelemetryService,
    ActionsService,
  ],
})
export class AppModule {}
