import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { OrganizationController } from './organization/organization.controller.js';

@Module({
  controllers: [HealthController, InventoryController, OrganizationController],
  providers: [runtimeConfigProvider, DatabaseService, AuthorizationGuard, InventoryService],
  exports: [DatabaseService, InventoryService],
})
export class AppModule {}
