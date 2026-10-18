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

const OrdersRecordController = createRecordController({
  guard: AuthorizationGuard,
  readPermission: 'orders:read',
});

@Module({
  controllers: [HealthController, OrderController, OrganizationController, OrdersRecordController],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    OrderService,
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
