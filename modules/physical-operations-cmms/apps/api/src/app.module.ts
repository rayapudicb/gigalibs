import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { AssetsController } from './assets/assets.controller.js';
import { AssetsService } from './assets/assets.service.js';
import { CmmsAuthorizationGuard } from './auth/authorization.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { MetersController } from './meters/meters.controller.js';
import { MetersService } from './meters/meters.service.js';
import { PartsController } from './parts/parts.controller.js';
import { PartsService } from './parts/parts.service.js';
import { PmSchedulesController } from './pm-schedules/pm-schedules.controller.js';
import { PmSchedulesService } from './pm-schedules/pm-schedules.service.js';
import { CmmsInboxController } from './relay/inbox.controller.js';
import { CmmsInboxService } from './relay/inbox.service.js';
import { CmmsOutboxRelay } from './relay/outbox-relay.js';
import { RelayInboxGuard } from './relay/relay-inbox.guard.js';
import { CMMS_RELAY_CONFIG, loadCmmsRelayConfig } from './relay/relay-config.js';
import { OUTBOX_RETENTION_CONFIG, OutboxRetention, loadOutboxRetentionConfig } from './relay/outbox-retention.js';
import { WorkOrdersController } from './work-orders/work-orders.controller.js';
import { WorkOrdersService } from './work-orders/work-orders.service.js';
import { RequestsController } from './requests/requests.controller.js';
import { RequestsService } from './requests/requests.service.js';

import { EamSpacesController } from './spaces/spaces.controller.js';
import { EamSpacesService } from './spaces/spaces.service.js';
import { ClassificationsController } from './classifications/classifications.controller.js';
import { ClassificationsService } from './classifications/classifications.service.js';
import { ReliabilityModule } from './reliability/reliability.module.js';

import { createRecordController, RECORD_DISPATCHER } from '@gigalibs/module-sdk';
import { cmmsRecordDispatcher } from './work-orders/cmms-record-adapters.js';

const CmmsRecordController = createRecordController({ guard: CmmsAuthorizationGuard, readPermission: 'cmms:read' });

/**
 * CMMS core runtime (WI-OI-038, roadmap P4): assets, work orders, preventive maintenance, meters and parts.
 * Staffing goes to Workforce through the outbox relay and inbox (WI-OI-068, ADR-0007 option A). People,
 * dispatch, requests, vendors, customers, purchase orders, import/export and IoT ingress are contained and not
 * mounted.
 */
@Module({
  imports: [DatabaseModule, ReliabilityModule],
  controllers: [
    HealthController,
    AssetsController,
    EamSpacesController,
    ClassificationsController,
    WorkOrdersController,
    RequestsController,
    PmSchedulesController,
    MetersController,
    PartsController,
    AnalyticsController,
    CmmsInboxController,
    CmmsRecordController,
  ],
  providers: [
    CmmsAuthorizationGuard,
    AssetsService,
    EamSpacesService,
    ClassificationsService,
    WorkOrdersService,
    RequestsService,
    PmSchedulesService,
    MetersService,
    PartsService,
    AnalyticsService,
    CmmsInboxService,
    CmmsOutboxRelay,
    RelayInboxGuard,
    { provide: CMMS_RELAY_CONFIG, useFactory: () => loadCmmsRelayConfig() },
    OutboxRetention,
    { provide: OUTBOX_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig() },
    {
      provide: RECORD_DISPATCHER,
      inject: [
        WorkOrdersService,
        AssetsService,
        PartsService,
        RequestsService,
        PmSchedulesService,
        MetersService,
        EamSpacesService,
        ClassificationsService,
      ],
      useFactory: (
        workOrders: WorkOrdersService,
        assets: AssetsService,
        parts: PartsService,
        requests: RequestsService,
        pmSchedules: PmSchedulesService,
        meters: MetersService,
        spaces: EamSpacesService,
        classifications: ClassificationsService,
      ) => cmmsRecordDispatcher({ workOrders, assets, parts, requests, pmSchedules, meters, spaces, classifications }),
    },
  ],
})
export class AppModule {}
