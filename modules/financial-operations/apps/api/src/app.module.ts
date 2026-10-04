import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { FinanceController } from './finance/finance.controller.js';
import { FinanceService } from './finance/finance.service.js';
import { ConsolidationController } from './consolidation/consolidation.controller.js';
import { ConsolidationService } from './consolidation/consolidation.service.js';
import { CostingController } from './costing/costing.controller.js';
import { CostingService } from './costing/costing.service.js';
import { FixedAssetsController } from './fixed-assets/fixed-assets.controller.js';
import { FixedAssetsService } from './fixed-assets/fixed-assets.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';
import { TreasuryController } from './treasury/treasury.controller.js';
import { TreasuryService } from './treasury/treasury.service.js';

@Module({
  controllers: [
    HealthController,
    FinanceController,
    TreasuryController,
    FixedAssetsController,
    ConsolidationController,
    CostingController,
    OrganizationController,
  ],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    FinanceService,
    TreasuryService,
    FixedAssetsService,
    ConsolidationService,
    CostingService,
  ],
  exports: [DatabaseService, FinanceService, TreasuryService, FixedAssetsService, ConsolidationService, CostingService],
})
export class AppModule {}

