import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { FinanceController } from './finance/finance.controller.js';
import { FinanceService } from './finance/finance.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';

@Module({
  controllers: [HealthController, FinanceController, OrganizationController],
  providers: [runtimeConfigProvider, DatabaseService, AuthorizationGuard, FinanceService],
  exports: [DatabaseService, FinanceService],
})
export class AppModule {}
