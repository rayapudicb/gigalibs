import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';
import { ProcurementController } from './procurement/procurement.controller.js';
import { ProcurementService } from './procurement/procurement.service.js';

@Module({
  controllers: [HealthController, ProcurementController, OrganizationController],
  providers: [runtimeConfigProvider, DatabaseService, AuthorizationGuard, ProcurementService],
  exports: [DatabaseService, ProcurementService],
})
export class AppModule {}
