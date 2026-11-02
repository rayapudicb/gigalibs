import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { AssetsController } from './assets/assets.controller.js';
import { AssetsService } from './assets/assets.service.js';
import { CmmsAuthorizationGuard } from './auth/authorization.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { CalibrationController } from './calibration/calibration.controller.js';
import { AssetAuditsController } from './commissioning/asset-audits.controller.js';
import { AssetAuditsService } from './commissioning/asset-audits.service.js';
import { AssetTagsController } from './commissioning/asset-tags.controller.js';
import { CommissioningController } from './commissioning/commissioning.controller.js';
import { CommissioningService } from './commissioning/commissioning.service.js';
import { SparesController } from './spares/spares.controller.js';
import { SparesService } from './spares/spares.service.js';
import { SopController } from './sop/sop.controller.js';
import { SopService } from './sop/sop.service.js';
import { CalibrationService } from './calibration/calibration.service.js';
import { MetersController } from './meters/meters.controller.js';
import { MetersService } from './meters/meters.service.js';
import { PartsController } from './parts/parts.controller.js';
import { PartsService } from './parts/parts.service.js';
import { PmSchedulesController } from './pm-schedules/pm-schedules.controller.js';
import { PmSchedulesService } from './pm-schedules/pm-schedules.service.js';
import { CmmsInboxController } from './relay/inbox.controller.js';
import { CmmsInboxService } from './relay/inbox.service.js';
import { CmmsAnalyticsDowntimeRelay } from './relay/analytics-downtime-relay.js';
import { CmmsAnalyticsControlTotalRelay } from './relay/analytics-control-total-relay.js';
import { CmmsOutboxRelay } from './relay/outbox-relay.js';
import { RelayInboxGuard } from './relay/relay-inbox.guard.js';
import {
  CMMS_ANALYTICS_RELAY_CONFIG,
  CMMS_RELAY_CONFIG,
  loadCmmsAnalyticsRelayConfig,
  loadCmmsRelayConfig,
} from './relay/relay-config.js';
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
import { DowntimesController } from './downtimes/downtimes.controller.js';
import { DowntimesService } from './downtimes/downtimes.service.js';

import {
  createRecordController,
  loadIdempotencyRetentionDays,
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
  RelayHealthController,
  loadRelayConfig,
} from '@gigalibs/module-sdk';
import { DatabaseService } from './database/database.service.js';
import { cmmsRecordDispatcher } from './work-orders/cmms-record-adapters.js';
import { CMMS_ROUNDS_INBOX_CONFIG, RoundsInboxController, RoundsInboxGuard, RoundsInboxService, RoundsMeterContextController } from './relay/rounds-inbox.js';

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
    // WI-OI-120as: GET v1/health/relays for the Workforce relay.
    RelayHealthController,
    AssetsController,
    DowntimesController,
    EamSpacesController,
    ClassificationsController,
    WorkOrdersController,
    RequestsController,
    PmSchedulesController,
    MetersController,
    CalibrationController,
    CommissioningController,
    AssetTagsController,
    AssetAuditsController,
    SparesController,
    SopController,
    PartsController,
    AnalyticsController,
    CmmsInboxController,
    RoundsInboxController,
    RoundsMeterContextController,
    CmmsRecordController,
  ],
  providers: [
    CalibrationService,
    CommissioningService,
    AssetAuditsService,
    SparesService,
    SopService,
    CmmsAuthorizationGuard,
    AssetsService,
    DowntimesService,
    EamSpacesService,
    ClassificationsService,
    WorkOrdersService,
    RequestsService,
    PmSchedulesService,
    MetersService,
    PartsService,
    AnalyticsService,
    CmmsInboxService,
    RoundsInboxService,
    RoundsInboxGuard,
    { provide: CMMS_ROUNDS_INBOX_CONFIG, useFactory: () => loadRelayConfig(process.env, {
      inboxPublicKey:'CMMS_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64',
      targetUrl:'CMMS_ROUNDS_UNUSED_RELAY_URL',signingKey:'CMMS_ROUNDS_UNUSED_RELAY_KEY_BASE64',
      interval:'CMMS_ROUNDS_INBOX_INTERVAL_MS',peerService:'operator-rounds-api',
    }) },
    CmmsOutboxRelay,
    CmmsAnalyticsDowntimeRelay,
    CmmsAnalyticsControlTotalRelay,
    RelayInboxGuard,
    { provide: CMMS_RELAY_CONFIG, useFactory: () => loadCmmsRelayConfig() },
    { provide: CMMS_ANALYTICS_RELAY_CONFIG, useFactory: () => loadCmmsAnalyticsRelayConfig() },
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
        DatabaseService,
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
        database: DatabaseService,
      ) =>
        // WI-OI-120be (W1 reviews B M2, C M1): Idempotency-Key results are kept in CMMS's own record_idempotency table,
        // as in Finance, Workforce and Catalogue, so a retry after a restart answers once and nothing grows in memory.
        cmmsRecordDispatcher(
          { workOrders, assets, parts, requests, pmSchedules, meters, spaces, classifications },
          new ModuleIdempotencyStore(database, { retentionDays: loadIdempotencyRetentionDays(process.env, 'CMMS') }),
        ),
    },
  ],
})
export class AppModule {}
