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
import { ordersRecordDispatcher } from './orders/orders-record-adapters.js';
import { OrderController } from './orders/orders.controller.js';
import { OrderService } from './orders/orders.service.js';
import { OrganizationController } from './organization/organization.controller.js';
import { OrdersArOutboxRelay } from './relay/orders-ar-relay.js';
import { BusinessPartnersCreditCheckClient } from './credit/business-partners-credit-check.client.js';
import { InventoryAtpCheckClient } from './inventory/inventory-atp-check.client.js';
import { InventoryReserveReleaseClient } from './inventory/inventory-reserve-release.client.js';
import { OrdersCreditUninvoicedRelay } from './relay/orders-credit-relay.js';
import { OrdersReturnsRmaInboxController } from './relay/returns-rma-inbox.controller.js';
import {
  ORDERS_RETURNS_RMA_INBOX_CONFIG,
  OrdersReturnsRmaInboxGuard,
  loadOrdersReturnsRmaInboxConfig,
} from './relay/returns-rma-inbox.guard.js';

const OrdersRecordController = createRecordController({
  guard: AuthorizationGuard,
  readPermission: 'orders:read',
});

@Module({
  controllers: [
    HealthController,
    OrderController,
    OrganizationController,
    OrdersRecordController,
    OrdersReturnsRmaInboxController,
  ],
  providers: [
    { provide: ORDERS_RETURNS_RMA_INBOX_CONFIG, useFactory: () => loadOrdersReturnsRmaInboxConfig() },
    OrdersReturnsRmaInboxGuard,
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    OrderService,
    BusinessPartnersCreditCheckClient,
    InventoryAtpCheckClient,
    InventoryReserveReleaseClient,
    OrdersArOutboxRelay,
    OrdersCreditUninvoicedRelay,
    {
      provide: RECORD_DISPATCHER,
      inject: [OrderService, DatabaseService],
      useFactory: (orders: OrderService, database: DatabaseService) =>
        ordersRecordDispatcher({ orders }, new ModuleIdempotencyStore(database, {
          retentionDays: loadIdempotencyRetentionDays(process.env, 'UNIVERSAL_ORDERS'),
        })),
    },
  ],
  exports: [DatabaseService, OrderService],
})
export class AppModule {}
