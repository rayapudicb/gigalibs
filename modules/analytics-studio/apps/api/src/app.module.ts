import { Module } from '@nestjs/common';
import { ConfigProvider } from './config.provider.js';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { DatabaseService } from './database/database.service.js';
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

@Module({
  imports: [ConnectorModule, IngestionModule, SchemaDiscoveryModule, DatasetModule, QueryEngineModule, ReportModule],
  controllers: [
    HealthController,
    SetupController,
    MetricsController,
    ActionsController,
    OidcDevController,
  ],
  providers: [
    ConfigProvider,
    DatabaseService,
    SetupService,
    MetricsService,
    TelemetryService,
    ActionsService,
    OidcDevService,
    OidcAuthorizationGuard,
  ],
  exports: [
    ConfigProvider,
    DatabaseService,
    SetupService,
    MetricsService,
    TelemetryService,
    ActionsService,
  ],
})
export class AppModule {}
