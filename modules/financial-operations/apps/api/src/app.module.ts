import { createRecordController, ModuleIdempotencyStore, RECORD_DISPATCHER } from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { FinanceController } from './finance/finance.controller.js';
import { financeRecordDispatcher } from './finance/finance-record-adapters.js';
import { FinanceRecordsService } from './finance/finance-records.service.js';
import { FinanceService } from './finance/finance.service.js';
import { JournalDraftsService } from './finance/journal-drafts.service.js';
import { ConsolidationController } from './consolidation/consolidation.controller.js';
import { ConsolidationService } from './consolidation/consolidation.service.js';
import { CostingController } from './costing/costing.controller.js';
import { CostingService } from './costing/costing.service.js';
import { BudgetingController } from './budgeting/budgeting.controller.js';
import { BudgetingService } from './budgeting/budgeting.service.js';
import { CloseController } from './close/close.controller.js';
import { CloseService } from './close/close.service.js';
import { FixedAssetsController } from './fixed-assets/fixed-assets.controller.js';
import { FixedAssetsService } from './fixed-assets/fixed-assets.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';
import { TreasuryController } from './treasury/treasury.controller.js';
import { TreasuryService } from './treasury/treasury.service.js';

// WI-OI-120l (U12): record routes behind the general ledger's metadata windows and its book and account pickers.
const FinanceRecordController = createRecordController({ guard: AuthorizationGuard, readPermission: 'finance:read' });

@Module({
  controllers: [
    HealthController,
    FinanceController,
    TreasuryController,
    FixedAssetsController,
    ConsolidationController,
    CostingController,
    BudgetingController,
    CloseController,
    OrganizationController,
    FinanceRecordController,
  ],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    FinanceService,
    FinanceRecordsService,
    JournalDraftsService,
    {
      provide: RECORD_DISPATCHER,
      inject: [DatabaseService, FinanceService, JournalDraftsService, FinanceRecordsService],
      useFactory: (database: DatabaseService, finance: FinanceService, drafts: JournalDraftsService, records: FinanceRecordsService) =>
        financeRecordDispatcher({ finance, drafts, records }, new ModuleIdempotencyStore(database)),
    },
    TreasuryService,
    FixedAssetsService,
    ConsolidationService,
    CostingService,
    BudgetingService,
    CloseService,
  ],
  exports: [DatabaseService, FinanceService, TreasuryService, FixedAssetsService, ConsolidationService, CostingService, BudgetingService, CloseService],
})
export class AppModule {}

