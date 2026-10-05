import { createRecordController, RECORD_DISPATCHER } from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import {
  AttributesController, CataloguesController, CategoriesController, PriceListsController,
  PricesController, ProductsController, UomConversionsController, UomsController,
} from './catalogue/catalogue.controller.js';
import { catalogueRecordDispatcher } from './catalogue/catalogue-lookups.js';
import { CatalogueService } from './catalogue/catalogue.service.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';

// WI-OI-120f (F0.5): record routes; today they serve the product and unit lookups other modules' windows use.
const CatalogueRecordController = createRecordController({ guard: AuthorizationGuard, readPermission: 'products:read' });

@Module({
  controllers: [HealthController, ProductsController, CategoriesController, UomsController,
    UomConversionsController, AttributesController, CataloguesController, PriceListsController,
    PricesController, OrganizationController, CatalogueRecordController],
  providers: [
    runtimeConfigProvider,
    DatabaseService,
    AuthorizationGuard,
    CatalogueService,
    { provide: RECORD_DISPATCHER, inject: [DatabaseService], useFactory: (database: DatabaseService) => catalogueRecordDispatcher(database) },
  ],
})
export class AppModule {}
