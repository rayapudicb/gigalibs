import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { RecordsController } from './records/records.controller.js';
import { RecordsService } from './records/records.service.js';
import { InventoryHandshakeClient } from './inventory/inventory-handshake.client.js';
import { InventoryReserveReleaseClient } from './inventory/inventory-reserve-release.client.js';
import { ManufacturingController } from './manufacturing/manufacturing.controller.js';
import { ManufacturingService } from './manufacturing/manufacturing.service.js';
import { createRelayHealthController } from '@gigalibs/module-sdk';
import {
  loadManufacturingFinanceRelayConfig,
  MANUFACTURING_FINANCE_RELAY_CONFIG,
} from './relay/relay-config.js';
import { ManufacturingFinanceOutboxRelay } from './relay/manufacturing-finance-relay.service.js';

const ManufacturingRelayHealthController = createRelayHealthController('v1/health');

/** Manufacturing & MRP runtime (WI-OI-126) on the module SDK. */
@Module({
  controllers: [HealthController, ManufacturingRelayHealthController, RecordsController, ManufacturingController],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    RecordsService,
    ManufacturingService,
    InventoryReserveReleaseClient,
    InventoryHandshakeClient,
    { provide: MANUFACTURING_FINANCE_RELAY_CONFIG, useFactory: () => loadManufacturingFinanceRelayConfig() },
    ManufacturingFinanceOutboxRelay,
  ],
})
export class AppModule {}
