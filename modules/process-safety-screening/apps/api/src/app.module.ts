import {
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
  createRecordController,
  loadIdempotencyRetentionDays,
} from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuditTrailController } from './audit-trail/audit-trail.controller.js';
import { AuditTrailService } from './audit-trail/audit-trail.service.js';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { CriteriaController } from './criteria/criteria.controller.js';
import { CriteriaService } from './criteria/criteria.service.js';
import { DatabaseService } from './database.service.js';
import { DossierWorker } from './dossiers/dossier-worker.js';
import { DossiersController, RouteDossiersController } from './dossiers/dossiers.controller.js';
import { DossiersService } from './dossiers/dossiers.service.js';
import { SpeedStorage, storageConfigFromEnv } from './dossiers/storage.js';
import { HealthController } from './health.controller.js';
import { LibraryController } from './library/library.controller.js';
import { LibraryService } from './library/library.service.js';
import { OrganizationController } from './organization/organization.controller.js';
import { OutcomesController } from './outcomes/outcomes.controller.js';
import { OutcomesService } from './outcomes/outcomes.service.js';
import { speedRecordDispatcher } from './projects/projects-record-adapters.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsService } from './projects/projects.service.js';
import {
  MaterialsController,
  RoutesController,
  StepsController,
} from './routes/routes.controller.js';
import { RoutesService } from './routes/routes.service.js';
import { StepsService } from './routes/steps.service.js';
import { SubstancesController } from './substances/substances.controller.js';
import { SubstancesService } from './substances/substances.service.js';

// WI-OI-120bw/120bx (SPEED S3, S4): projects, criteria sets, substances, routes and their content through the module's
// API and its metadata windows, and the organization replica the sites come from. WI-OI-120ca (S7): dossiers, their
// worker and the object store they are kept in.
const SpeedRecordController = createRecordController({
  guard: AuthorizationGuard,
  readPermission: 'speed.routes.read',
});

@Module({
  controllers: [
    HealthController,
    ProjectsController,
    CriteriaController,
    LibraryController,
    SubstancesController,
    RoutesController,
    StepsController,
    MaterialsController,
    RouteDossiersController,
    DossiersController,
    OutcomesController,
    AuditTrailController,
    OrganizationController,
    SpeedRecordController,
  ],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    ProjectsService,
    CriteriaService,
    LibraryService,
    SubstancesService,
    RoutesService,
    StepsService,
    {
      provide: SpeedStorage,
      useFactory: () => new SpeedStorage(storageConfigFromEnv(process.env)),
    },
    DossiersService,
    DossierWorker,
    OutcomesService,
    AuditTrailService,
    {
      provide: RECORD_DISPATCHER,
      inject: [
        DatabaseService,
        ProjectsService,
        SubstancesService,
        RoutesService,
        CriteriaService,
        LibraryService,
      ],
      useFactory: (
        database: DatabaseService,
        projects: ProjectsService,
        substances: SubstancesService,
        routes: RoutesService,
        criteria: CriteriaService,
        library: LibraryService,
      ) =>
        speedRecordDispatcher(
          { projects, substances, routes, criteria, library },
          new ModuleIdempotencyStore(database, {
            retentionDays: loadIdempotencyRetentionDays(process.env, 'SPEED'),
          }),
        ),
    },
  ],
})
export class AppModule {}
