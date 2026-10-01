import { Module } from '@nestjs/common';
import { GigaOpsAuthorizationGuard } from './auth/authorization.js';
import { GigaOpsConfigProvider } from './config.provider.js';
import { WorkforceDatabaseService } from './database/database.service.js';
import { WorkforceHealthController } from './health/health.controller.js';
import { WorkforceRuntimeController } from './runtime/runtime.controller.js';
import {
  WorkforceCapabilitiesController,
  WorkforceResourcesController,
} from './resources/workforce-resources.controller.js';
import { WorkforceResourcesService } from './resources/workforce-resources.service.js';
import { EngagementsController, JobProfilesController, PositionsController } from './jobs/jobs.controller.js';
import { JobsService } from './jobs/jobs.service.js';
import {
  AbsenceTypesController,
  AbsencesController,
  AvailabilityController,
  AvailabilityPatternsController,
  WorkingCalendarsController,
} from './availability/availability.controller.js';
import { AvailabilityService } from './availability/availability.service.js';
import { BookingsController, WorkRequirementsController } from './bookings/bookings.controller.js';
import { BookingsService } from './bookings/bookings.service.js';
import { WorkforceInboxController } from './relay/inbox.controller.js';
import { WorkforceInboxService } from './relay/inbox.service.js';
import { WorkforceOutboxRelay } from './relay/outbox-relay.js';
import { RelayInboxGuard } from './relay/relay-inbox.guard.js';
import { WORKFORCE_RELAY_CONFIG, loadWorkforceRelayConfig } from './relay/relay-config.js';
import { OUTBOX_RETENTION_CONFIG, OutboxRetention, loadOutboxRetentionConfig } from './relay/outbox-retention.js';
import { PunchesController, TimeCorrectionsController, TimeExceptionsController, TimesheetsController } from './time/time.controller.js';
import { TimeService } from './time/time.service.js';
import { PayController } from './pay/pay.controller.js';
import { PayExportService } from './pay/pay-export.service.js';
import { PayService } from './pay/pay.service.js';
import { WorkforcePackController } from './pack/pack.controller.js';
import { WorkforcePackService } from './pack/pack.service.js';

@Module({
  controllers: [
    WorkforceHealthController,
    WorkforceRuntimeController,
    WorkforceResourcesController,
    WorkforceCapabilitiesController,
    JobProfilesController,
    PositionsController,
    EngagementsController,
    AvailabilityPatternsController,
    AvailabilityController,
    AbsenceTypesController,
    AbsencesController,
    WorkingCalendarsController,
    WorkRequirementsController,
    BookingsController,
    WorkforceInboxController,
    PunchesController,
    TimesheetsController,
    TimeCorrectionsController,
    TimeExceptionsController,
    PayController,
    WorkforcePackController,
  ],
  providers: [
    GigaOpsConfigProvider,
    WorkforceDatabaseService,
    GigaOpsAuthorizationGuard,
    WorkforceResourcesService,
    WorkforcePackService,
    JobsService,
    AvailabilityService,
    BookingsService,
    WorkforceInboxService,
    TimeService,
    PayService,
    PayExportService,
    WorkforceOutboxRelay,
    RelayInboxGuard,
    { provide: WORKFORCE_RELAY_CONFIG, useFactory: () => loadWorkforceRelayConfig() },
    OutboxRetention,
    { provide: OUTBOX_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig() },
  ],
})
export class GigaOpsModule {}
