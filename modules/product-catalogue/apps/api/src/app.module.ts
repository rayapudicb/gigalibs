import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import {
  AttributesController, CataloguesController, CategoriesController, PriceListsController,
  PricesController, ProductsController, UomConversionsController, UomsController,
} from './catalogue/catalogue.controller.js';
import { CatalogueService } from './catalogue/catalogue.service.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';

@Module({
  controllers: [HealthController, ProductsController, CategoriesController, UomsController,
    UomConversionsController, AttributesController, CataloguesController, PriceListsController,
    PricesController, OrganizationController],
  providers: [runtimeConfigProvider, DatabaseService, AuthorizationGuard, CatalogueService],
})
export class AppModule {}
