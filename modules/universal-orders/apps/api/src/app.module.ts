import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { OrderController } from './orders/orders.controller.js';
import { OrderService } from './orders/orders.service.js';
import { OrganizationController } from './organization/organization.controller.js';

@Module({
  controllers: [HealthController, OrderController, OrganizationController],
  providers: [runtimeConfigProvider, DatabaseService, AuthorizationGuard, OrderService],
  exports: [DatabaseService, OrderService],
})
export class AppModule {}
