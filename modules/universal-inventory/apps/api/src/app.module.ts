import {
  createRecordController,
  loadIdempotencyRetentionDays,
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
} from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { inventoryRecordDispatcher } from './inventory/inventory-record-adapters.js';
import { InventoryRecordsService } from './inventory/inventory-records.service.js';
import { AtpCheckCommandController } from './inventory/atp-check-command.controller.js';
import { ManufacturingAtpCommandController } from './inventory/manufacturing-atp-command.controller.js';
import {
  MANUFACTURING_ATP_COMMAND_CONFIG,
  ManufacturingAtpCommandGuard,
  loadManufacturingAtpCommandConfig,
} from './inventory/manufacturing-atp-command.guard.js';
import {
  ATP_CHECK_COMMAND_CONFIG,
  AtpCheckCommandGuard,
  loadAtpCheckCommandConfig,
} from './inventory/atp-check-command.guard.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { ReserveReleaseCommandController } from './inventory/reserve-release-command.controller.js';
import { ManufacturingReserveCommandController } from './inventory/manufacturing-reserve-command.controller.js';
import {
  MANUFACTURING_RESERVE_COMMAND_CONFIG,
  ManufacturingReserveCommandGuard,
  loadManufacturingReserveCommandConfig,
} from './inventory/manufacturing-reserve-command.guard.js';
import {
  RESERVE_RELEASE_COMMAND_CONFIG,
  ReserveReleaseCommandGuard,
  loadReserveReleaseCommandConfig,
} from './inventory/reserve-release-command.guard.js';
import { IssueDemandCommandController } from './inventory/issue-demand-command.controller.js';
import {
  ISSUE_DEMAND_COMMAND_CONFIG,
  IssueDemandCommandGuard,
  loadIssueDemandCommandConfig,
} from './inventory/issue-demand-command.guard.js';
import { ProductionReceiptCommandController } from './inventory/production-receipt-command.controller.js';
import {
  PRODUCTION_RECEIPT_COMMAND_CONFIG,
  ProductionReceiptCommandGuard,
  loadProductionReceiptCommandConfig,
} from './inventory/production-receipt-command.guard.js';
import { RmaReturnReceiptCommandController } from './inventory/rma-return-receipt-command.controller.js';
import {
  RMA_RETURN_RECEIPT_COMMAND_CONFIG,
  RmaReturnReceiptCommandGuard,
  loadRmaReturnReceiptCommandConfig,
} from './inventory/rma-return-receipt-command.guard.js';
import { InventoryPostingCutoffService } from './inventory/inventory-posting-cutoff.service.js';
import { InventoryService } from './inventory/inventory.service.js';
import { ReplenishmentService } from './inventory/replenishment.service.js';
import { TransferService } from './inventory/transfer.service.js';
import { OrganizationController } from './organization/organization.controller.js';
import { createRelayHealthController } from '@gigalibs/module-sdk';
import { FinanceInventoryInboxController } from './relay/finance-inbox.controller.js';
import { FinanceInventoryInboxService } from './relay/finance-inbox.service.js';
import { InventoryRelayInboxGuard } from './relay/inbox.guard.js';
import { InventoryFinanceOutboxRelay } from './relay/inventory-finance-relay.js';
import { InventoryProcurementOutboxRelay } from './relay/inventory-procurement-relay.js';
import {
  INVENTORY_FINANCE_INBOX_CONFIG,
  INVENTORY_RELAY_CONFIG,
  loadInventoryFinanceInboxConfig,
  loadInventoryFinanceRelayConfig,
  loadInventoryProcurementRelayConfig,
  INVENTORY_PROCUREMENT_RELAY_CONFIG,
} from './relay/relay-config.js';

const InventoryRelayHealthController = createRelayHealthController('v1/health');

// WI-OI-120f (F0.5): the record routes behind Inventory's metadata windows. The signed-context guard checks the
// Universal Inventory entitlement and inventory.read on every route; the dispatcher checks each entity's permissions.
const InventoryRecordController = createRecordController({ guard: AuthorizationGuard, readPermission: 'inventory.read' });

@Module({
  controllers: [
    HealthController,
    InventoryRelayHealthController,
    InventoryController,
    AtpCheckCommandController,
    ManufacturingAtpCommandController,
    ReserveReleaseCommandController,
    ManufacturingReserveCommandController,
    IssueDemandCommandController,
    ProductionReceiptCommandController,
    RmaReturnReceiptCommandController,
    OrganizationController,
    FinanceInventoryInboxController,
    InventoryRecordController,
  ],
  providers: [
    { provide: INVENTORY_RELAY_CONFIG, useFactory: () => loadInventoryFinanceRelayConfig() },
    { provide: INVENTORY_PROCUREMENT_RELAY_CONFIG, useFactory: () => loadInventoryProcurementRelayConfig() },
    { provide: INVENTORY_FINANCE_INBOX_CONFIG, useFactory: () => loadInventoryFinanceInboxConfig() },
    InventoryRelayInboxGuard,
    FinanceInventoryInboxService,
    InventoryFinanceOutboxRelay,
    InventoryProcurementOutboxRelay,
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    InventoryPostingCutoffService,
    InventoryService,
    TransferService,
    ReplenishmentService,
    { provide: ATP_CHECK_COMMAND_CONFIG, useFactory: () => loadAtpCheckCommandConfig() },
    AtpCheckCommandGuard,
    { provide: MANUFACTURING_ATP_COMMAND_CONFIG, useFactory: () => loadManufacturingAtpCommandConfig() },
    ManufacturingAtpCommandGuard,
    { provide: RESERVE_RELEASE_COMMAND_CONFIG, useFactory: () => loadReserveReleaseCommandConfig() },
    ReserveReleaseCommandGuard,
    { provide: MANUFACTURING_RESERVE_COMMAND_CONFIG, useFactory: () => loadManufacturingReserveCommandConfig() },
    ManufacturingReserveCommandGuard,
    { provide: ISSUE_DEMAND_COMMAND_CONFIG, useFactory: () => loadIssueDemandCommandConfig() },
    IssueDemandCommandGuard,
    { provide: PRODUCTION_RECEIPT_COMMAND_CONFIG, useFactory: () => loadProductionReceiptCommandConfig() },
    ProductionReceiptCommandGuard,
    { provide: RMA_RETURN_RECEIPT_COMMAND_CONFIG, useFactory: () => loadRmaReturnReceiptCommandConfig() },
    RmaReturnReceiptCommandGuard,
    InventoryRecordsService,
    {
      provide: RECORD_DISPATCHER,
      inject: [InventoryService, InventoryRecordsService, DatabaseService],
      useFactory: (inventory: InventoryService, records: InventoryRecordsService, database: DatabaseService) =>
        inventoryRecordDispatcher({ inventory, records }, new ModuleIdempotencyStore(database, {
          retentionDays: loadIdempotencyRetentionDays(process.env, 'UNIVERSAL_INVENTORY'),
        })),
    },
  ],
  exports: [DatabaseService, InventoryService],
})
export class AppModule {}
