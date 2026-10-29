import {
  createRecordController,
  createRelayHealthController,
  loadIdempotencyRetentionDays,
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
} from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { FinanceController } from './finance/finance.controller.js';
import { financeRecordDispatcher } from './finance/finance-record-adapters.js';
import { FinanceRecordsService } from './finance/finance-records.service.js';
import { FinanceService } from './finance/finance.service.js';
import {
  FINANCE_ACCOUNT_REFERENCE_CONFIG,
  FinanceAccountReferenceController,
  FinanceAccountReferenceGuard,
  loadFinanceAccountReferenceConfig,
} from './finance/account-reference.controller.js';
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
import { FINANCE_RELAY_CONFIG, loadFinanceRelayConfig } from './relay/relay-config.js';
import { FinanceRelayInboxGuard } from './relay/inbox.guard.js';
import {
  FINANCE_MANUFACTURING_INBOX_CONFIG,
  FinanceManufacturingInboxGuard,
  loadFinanceManufacturingInboxConfig,
} from './relay/manufacturing-inbox.guard.js';
import { FinanceInventoryInboxController } from './subledger/inventory-inbox.controller.js';
import { FinanceManufacturingInboxController } from './subledger/manufacturing-inbox.controller.js';
import { FinanceReturnsInboxController } from './subledger/returns-inbox.controller.js';
import { ReturnsInboxService } from './subledger/returns-inbox.service.js';
import {
  FINANCE_RETURNS_INBOX_CONFIG,
  FinanceReturnsInboxGuard,
  loadFinanceReturnsInboxConfig,
} from './relay/returns-inbox.guard.js';
import { InventorySubledgerController } from './subledger/inventory-subledger.controller.js';
import { InventorySubledgerInboxService } from './subledger/inventory-inbox.service.js';
import { InventoryReceiptPostingReconciliationJob } from './posting/inventory-receipt-posting-reconciliation-job.js';
import { FinanceInventoryOutboxRelay } from './relay/finance-inventory-relay.js';
import {
  FINANCE_INVENTORY_OUTBOUND_CONFIG,
  loadFinanceInventoryOutboundConfig,
} from './relay/relay-config.js';

// WI-OI-120l (U12): record routes behind the general ledger's metadata windows and its book and account pickers.
const FinanceRecordController = createRecordController({ guard: AuthorizationGuard, readPermission: 'finance:read' });
const FinanceRelayHealthController = createRelayHealthController('v1/health');

@Module({
  controllers: [
    HealthController,
    FinanceRelayHealthController,
    FinanceController,
    FinanceAccountReferenceController,
    TreasuryController,
    FixedAssetsController,
    ConsolidationController,
    CostingController,
    BudgetingController,
    CloseController,
    OrganizationController,
    FinanceRecordController,
    FinanceInventoryInboxController,
    FinanceManufacturingInboxController,
    FinanceReturnsInboxController,
    InventorySubledgerController,
  ],
  providers: [
    { provide: FINANCE_RELAY_CONFIG, useFactory: () => loadFinanceRelayConfig() },
    { provide: FINANCE_ACCOUNT_REFERENCE_CONFIG, useFactory: () => loadFinanceAccountReferenceConfig() },
    FinanceAccountReferenceGuard,
    { provide: FINANCE_INVENTORY_OUTBOUND_CONFIG, useFactory: () => loadFinanceInventoryOutboundConfig() },
    FinanceRelayInboxGuard,
    { provide: FINANCE_MANUFACTURING_INBOX_CONFIG, useFactory: () => loadFinanceManufacturingInboxConfig() },
    FinanceManufacturingInboxGuard,
    { provide: FINANCE_RETURNS_INBOX_CONFIG, useFactory: () => loadFinanceReturnsInboxConfig() },
    FinanceReturnsInboxGuard,
    ReturnsInboxService,
    FinanceInventoryOutboxRelay,
    InventorySubledgerInboxService,
    InventoryReceiptPostingReconciliationJob,
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    FinanceService,
    FinanceRecordsService,
    JournalDraftsService,
    {
      provide: RECORD_DISPATCHER,
      inject: [DatabaseService, FinanceService, JournalDraftsService, FinanceRecordsService, CostingService],
      useFactory: (
        database: DatabaseService,
        finance: FinanceService,
        drafts: JournalDraftsService,
        records: FinanceRecordsService,
        costing: CostingService,
      ) =>
        financeRecordDispatcher({ finance, drafts, records, costing }, new ModuleIdempotencyStore(database, {
          retentionDays: loadIdempotencyRetentionDays(process.env, 'FINANCIAL_OPERATIONS'),
        })),
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

