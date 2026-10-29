import { Module } from '@nestjs/common';
import { IotAuthorizationGuard } from './auth/authorization.js';
import { AlertsController } from './alerts/alerts.controller.js';
import { AlertsService } from './alerts/alerts.service.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { DatabaseModule } from './database/database.module.js';
import { DevicesController } from './devices/devices.controller.js';
import { DevicesService } from './devices/devices.service.js';
import { DiscoveryController } from './discovery/discovery.controller.js';
import { DiscoveryService } from './discovery/discovery.service.js';
import { HealthController } from './health/health.controller.js';
import { IngestController } from './ingest/ingest.controller.js';
import { IngestService } from './ingest/ingest.service.js';
import { ProtocolsController } from './protocols/protocols.controller.js';
import { RulesController } from './rules/rules.controller.js';
import { RulesService } from './rules/rules.service.js';
import { TelemetryEvaluationService } from './telemetry/telemetry-evaluation.service.js';
import { IotCmmsRelayService } from './relay/iot-cmms-relay.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    DashboardController,
    DevicesController,
    IngestController,
    AlertsController,
    RulesController,
    ProtocolsController,
    DiscoveryController,
  ],
  providers: [
    IotAuthorizationGuard,
    DashboardService,
    DevicesService,
    IngestService,
    AlertsService,
    RulesService,
    DiscoveryService,
    TelemetryEvaluationService,
    IotCmmsRelayService,
  ],
})
export class AppModule {}
