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
import {
  ATP_CHECK_COMMAND_CONFIG,
  AtpCheckCommandGuard,
  loadAtpCheckCommandConfig,
} from './inventory/atp-check-command.guard.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { ReserveReleaseCommandController } from './inventory/reserve-release-command.controller.js';
import {
  RESERVE_RELEASE_COMMAND_CONFIG,
  ReserveReleaseCommandGuard,
  loadReserveReleaseCommandConfig,
} from './inventory/reserve-release-command.guard.js';
import { InventoryPostingCutoffService } from './inventory/inventory-posting-cutoff.service.js';
import { InventoryService } from './inventory/inventory.service.js';
import { OrganizationController } from './organization/organization.controller.js';
import { createRelayHealthController } from '@gigalibs/module-sdk';
import { FinanceInventoryInboxController } from './relay/finance-inbox.controller.js';
import { FinanceInventoryInboxService } from './relay/finance-inbox.service.js';
import { InventoryRelayInboxGuard } from './relay/inbox.guard.js';
import { InventoryFinanceOutboxRelay } from './relay/inventory-finance-relay.js';
import {
  INVENTORY_FINANCE_INBOX_CONFIG,
  INVENTORY_RELAY_CONFIG,
  loadInventoryFinanceInboxConfig,
  loadInventoryFinanceRelayConfig,
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
    ReserveReleaseCommandController,
    OrganizationController,
    FinanceInventoryInboxController,
    InventoryRecordController,
  ],
  providers: [
    { provide: INVENTORY_RELAY_CONFIG, useFactory: () => loadInventoryFinanceRelayConfig() },
    { provide: INVENTORY_FINANCE_INBOX_CONFIG, useFactory: () => loadInventoryFinanceInboxConfig() },
    InventoryRelayInboxGuard,
    FinanceInventoryInboxService,
    InventoryFinanceOutboxRelay,
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    InventoryPostingCutoffService,
    InventoryService,
    { provide: ATP_CHECK_COMMAND_CONFIG, useFactory: () => loadAtpCheckCommandConfig() },
    AtpCheckCommandGuard,
    { provide: RESERVE_RELEASE_COMMAND_CONFIG, useFactory: () => loadReserveReleaseCommandConfig() },
    ReserveReleaseCommandGuard,
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
