import {
  createRecordController,
  loadIdempotencyRetentionDays,
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
} from '@gigalibs/module-sdk';
import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import {
  AttributesController, CataloguesController, CategoriesController, PriceListsController,
  PricesController, ProductsController, UomConversionsController, UomsController,
} from './catalogue/catalogue.controller.js';
import { catalogueRecordDispatcher } from './catalogue/catalogue-record-adapters.js';
import { CatalogueRecordsService } from './catalogue/catalogue-records.service.js';
import { CatalogueService } from './catalogue/catalogue.service.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { OrganizationController } from './organization/organization.controller.js';

// WI-OI-120f/g (F0.5, U7): record routes behind the Catalogue's metadata windows, and the product and unit lookups
// other modules' windows use.
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
    CatalogueRecordsService,
    {
      provide: RECORD_DISPATCHER,
      inject: [DatabaseService, CatalogueService, CatalogueRecordsService],
      useFactory: (database: DatabaseService, catalogue: CatalogueService, records: CatalogueRecordsService) =>
        catalogueRecordDispatcher({ catalogue, records }, new ModuleIdempotencyStore(database, {
          retentionDays: loadIdempotencyRetentionDays(process.env, 'PRODUCT_CATALOGUE'),
        })),
    },
  ],
})
export class AppModule {}
