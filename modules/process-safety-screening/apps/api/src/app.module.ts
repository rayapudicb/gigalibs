import {
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
  createRecordController,
  loadIdempotencyRetentionDays,
} from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { CriteriaController } from './criteria/criteria.controller.js';
import { CriteriaService } from './criteria/criteria.service.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { LibraryController } from './library/library.controller.js';
import { LibraryService } from './library/library.service.js';
import { OrganizationController } from './organization/organization.controller.js';
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
// API and its metadata windows, and the organization replica the sites come from.
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
