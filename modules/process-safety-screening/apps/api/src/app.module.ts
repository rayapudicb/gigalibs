import {
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
  createRecordController,
  loadIdempotencyRetentionDays,
} from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';
import { speedRecordDispatcher } from './projects/projects-record-adapters.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsService } from './projects/projects.service.js';

// WI-OI-120bw (SPEED S3): projects through the module's API and its metadata windows, and the organization replica the
// projects' sites come from.
const SpeedRecordController = createRecordController({
  guard: AuthorizationGuard,
  readPermission: 'speed.routes.read',
});

@Module({
  controllers: [
    HealthController,
    ProjectsController,
    OrganizationController,
    SpeedRecordController,
  ],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    ProjectsService,
    {
      provide: RECORD_DISPATCHER,
      inject: [DatabaseService, ProjectsService],
      useFactory: (database: DatabaseService, projects: ProjectsService) =>
        speedRecordDispatcher(
          { projects },
          new ModuleIdempotencyStore(database, {
            retentionDays: loadIdempotencyRetentionDays(process.env, 'SPEED'),
          }),
        ),
    },
  ],
})
export class AppModule {}
