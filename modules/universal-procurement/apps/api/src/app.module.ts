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
import { OrganizationController } from './organization/organization.controller.js';
import { procurementRecordDispatcher } from './procurement/procurement-record-adapters.js';
import { ProcurementController } from './procurement/procurement.controller.js';
import { ProcurementService } from './procurement/procurement.service.js';
import {
  PROCUREMENT_INVENTORY_RELAY_CONFIG,
  ProcurementInventoryInboxController,
  ProcurementInventoryInboxGuard,
  loadProcurementInventoryRelayConfig,
} from './relay/inventory-replenishment-inbox.js';

const ProcurementRecordController = createRecordController({
  guard: AuthorizationGuard,
  readPermission: 'procurement:read',
});

@Module({
  // The inventory→procurement replenishment inbox is registered here (not as a separate module) so its controller
  // shares AppModule's scope where ProcurementService and DatabaseService are provided (NestJS DI encapsulation).
  controllers: [
    HealthController,
    ProcurementController,
    OrganizationController,
    ProcurementRecordController,
    ProcurementInventoryInboxController,
  ],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    ProcurementService,
    ProcurementInventoryInboxGuard,
    { provide: PROCUREMENT_INVENTORY_RELAY_CONFIG, useFactory: () => loadProcurementInventoryRelayConfig() },
    {
      provide: RECORD_DISPATCHER,
      inject: [ProcurementService, DatabaseService],
      useFactory: (procurement: ProcurementService, database: DatabaseService) =>
        procurementRecordDispatcher({ procurement }, new ModuleIdempotencyStore(database, {
          retentionDays: loadIdempotencyRetentionDays(process.env, 'UNIVERSAL_PROCUREMENT'),
        })),
    },
  ],
  exports: [DatabaseService, ProcurementService],
})
export class AppModule {}
