import { Module } from '@nestjs/common';
import {
  createRecordController,
  loadIdempotencyRetentionDays,
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
} from '@gigalibs/module-sdk';
import { GigaOpsAuthorizationGuard } from './auth/authorization.js';
import { workforceRecordDispatcher } from './resources/workforce-record-adapters.js';
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
import { WorkforceAnalyticsOutboxRelay, WorkforceOutboxRelay } from './relay/outbox-relay.js';
import { RelayInboxGuard } from './relay/relay-inbox.guard.js';
import {
  WORKFORCE_ANALYTICS_RELAY_CONFIG,
  WORKFORCE_RELAY_CONFIG,
  loadWorkforceAnalyticsRelayConfig,
  loadWorkforceRelayConfig,
} from './relay/relay-config.js';
import { OUTBOX_RETENTION_CONFIG, OutboxRetention, loadOutboxRetentionConfig } from './relay/outbox-retention.js';
import { PunchesController, TimeCorrectionsController, TimeExceptionsController, TimesheetsController } from './time/time.controller.js';
import { TimeService } from './time/time.service.js';
import { PayController } from './pay/pay.controller.js';
import { PayExportService } from './pay/pay-export.service.js';
import { PayService } from './pay/pay.service.js';
import { WorkforcePackController } from './pack/pack.controller.js';
import { WorkforcePackService } from './pack/pack.service.js';
import { WorkforceOrganizationReplicaController } from './organization/organization-replica.controller.js';
import { WorkforceOrganizationReplicaService } from './organization/organization-replica.service.js';
import { WfoWorkersService } from './workers/wfo-workers.service.js';
import { WfoEngagementsService } from './engagements/wfo-engagements.service.js';
import { WfoStaffingService } from './staffing/wfo-staffing.service.js';
import { WfoExpensesService } from './expenses/wfo-expenses.service.js';
import { WfoPayrollAdminService } from './payroll/wfo-payroll-admin.service.js';
import { WfoForecastingService } from './forecasting/wfo-forecasting.service.js';
import { WfoShiftsService } from './shifts/wfo-shifts.service.js';
import { WfoComplianceService } from './compliance/wfo-compliance.service.js';
import { WfoCommsService } from './comms/wfo-comms.service.js';
import { WfoVendorsService } from './vendors/wfo-vendors.service.js';
import { WfoPacksService } from './packs/wfo-packs.service.js';
import { WfoReportsService } from './reports/wfo-reports.service.js';

const GigaOpsRecordController = createRecordController({ guard: GigaOpsAuthorizationGuard, readPermission: 'workforce:read' });

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
    WorkforceOrganizationReplicaController,
    // WI-OI-120u Slice 3 (U20a; owner "retire all", 2026-10-13): the WFO controllers (workers, engagements, staffing,
    // expenses, payroll admin, forecasting, shifts, compliance, comms, vendors, packs, reports) are retired: no route,
    // nothing new written. Their services and empty tables stay until they are removed after T1b.
    GigaOpsRecordController,
  ],
  providers: [
    GigaOpsConfigProvider,
    WorkforceDatabaseService,
    GigaOpsAuthorizationGuard,
    WorkforceResourcesService,
    WorkforcePackService,
    WorkforceOrganizationReplicaService,
    WfoWorkersService,
    WfoEngagementsService,
    WfoStaffingService,
    WfoExpensesService,
    WfoPayrollAdminService,
    WfoForecastingService,
    WfoShiftsService,
    WfoComplianceService,
    WfoCommsService,
    WfoVendorsService,
    WfoPacksService,
    WfoReportsService,
    JobsService,
    AvailabilityService,
    BookingsService,
    WorkforceInboxService,
    TimeService,
    PayService,
    PayExportService,
    WorkforceOutboxRelay,
    WorkforceAnalyticsOutboxRelay,
    RelayInboxGuard,
    { provide: WORKFORCE_RELAY_CONFIG, useFactory: () => loadWorkforceRelayConfig() },
    { provide: WORKFORCE_ANALYTICS_RELAY_CONFIG, useFactory: () => loadWorkforceAnalyticsRelayConfig() },
    OutboxRetention,
    { provide: OUTBOX_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig() },
    // WI-OI-120u (M-WF1): the metadata windows' record dispatcher; Idempotency-Key answers live in record_idempotency.
    {
      provide: RECORD_DISPATCHER,
      inject: [WorkforceResourcesService, JobsService, AvailabilityService, BookingsService, WorkforceDatabaseService],
      useFactory: (
        resources: WorkforceResourcesService,
        jobs: JobsService,
        availability: AvailabilityService,
        bookings: BookingsService,
        database: WorkforceDatabaseService,
      ) => workforceRecordDispatcher({ resources, jobs, availability, bookings }, new ModuleIdempotencyStore(database, {
        retentionDays: loadIdempotencyRetentionDays(process.env, 'WORKFORCE'),
      })),
    },
  ],
})
export class GigaOpsModule {}

