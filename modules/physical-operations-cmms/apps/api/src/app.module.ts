import { Module } from '@nestjs/common';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { cmmsConfigProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { LocationsController } from './locations/locations.controller.js';
import { LocationsService } from './locations/locations.service.js';
import { AssetsController } from './assets/assets.controller.js';
import { AssetsService } from './assets/assets.service.js';
import { WorkOrdersController } from './work-orders/work-orders.controller.js';
import { WorkOrdersService } from './work-orders/work-orders.service.js';
import { MetersController, IotIngressController } from './meters/meters.controller.js';
import { MetersService } from './meters/meters.service.js';
import { PartsController } from './parts/parts.controller.js';
import { PartsService } from './parts/parts.service.js';
import { PmSchedulesController } from './pm-schedules/pm-schedules.controller.js';
import { PmSchedulesService } from './pm-schedules/pm-schedules.service.js';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { WorkforceController } from './workforce/workforce.controller.js';
import { WorkforceService } from './workforce/workforce.service.js';
import { VendorsController } from './vendors/vendors.controller.js';
import { VendorsService } from './vendors/vendors.service.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersService } from './customers/customers.service.js';
import { RequestsController } from './requests/requests.controller.js';
import { RequestsService } from './requests/requests.service.js';
import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller.js';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service.js';

@Module({
  controllers: [
    HealthController,
    OidcDevController,
    LocationsController,
    AssetsController,
    WorkOrdersController,
    MetersController,
    IotIngressController,
    PartsController,
    PmSchedulesController,
    AnalyticsController,
    WorkforceController,
    VendorsController,
    CustomersController,
    RequestsController,
    PurchaseOrdersController,
  ],
  providers: [
    cmmsConfigProvider,
    DatabaseService,
    OidcDevService,
    OidcAuthorizationGuard,
    LocationsService,
    AssetsService,
    WorkOrdersService,
    MetersService,
    PartsService,
    PmSchedulesService,
    AnalyticsService,
    WorkforceService,
    VendorsService,
    CustomersService,
    RequestsService,
    PurchaseOrdersService,
  ],
})
export class AppModule {}
