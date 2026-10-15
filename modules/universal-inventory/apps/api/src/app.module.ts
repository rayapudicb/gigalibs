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
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { OrganizationController } from './organization/organization.controller.js';

// WI-OI-120f (F0.5): the record routes behind Inventory's metadata windows. The signed-context guard checks the
// Universal Inventory entitlement and inventory:read on every route; the dispatcher checks each entity's permissions.
const InventoryRecordController = createRecordController({ guard: AuthorizationGuard, readPermission: 'inventory:read' });

@Module({
  controllers: [HealthController, InventoryController, OrganizationController, InventoryRecordController],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    InventoryService,
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
