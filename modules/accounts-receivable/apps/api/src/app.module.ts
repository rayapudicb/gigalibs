import {
  createRecordController,
  loadIdempotencyRetentionDays,
  ModuleIdempotencyStore,
  RECORD_DISPATCHER,
} from '@gigalibs/module-sdk';
import { Module, OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ArAuthorizationGuard,
  OidcAuthorizationGuard,
  PlatformArAuthorizationGuard,
} from './auth/authorization.js';
import {
  AR_MODULE_RUNTIME_CONFIG,
  arModuleRuntimeConfigProvider,
} from './config.module-sdk.js';
import type { ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { BillingEntityController } from './billing-entity/billing-entity.controller.js';
import { BillingEntityService } from './billing-entity/billing-entity.service.js';
import { arConfigProvider } from './config.provider.js';
import { CreditNotesController } from './credit-notes/credit-notes.controller.js';
import { CreditNotesService } from './credit-notes/credit-notes.service.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersService } from './customers/customers.service.js';
import { DatabaseService } from './database/database.service.js';
import { DeliveriesController } from './deliveries/deliveries.controller.js';
import { DeliveriesService } from './deliveries/deliveries.service.js';
import { HealthController } from './health/health.controller.js';
import { InvoicesController } from './invoices/invoices.controller.js';
import { InvoicesService } from './invoices/invoices.service.js';
import { PaymentsController } from './payments/payments.controller.js';
import { PaymentsService } from './payments/payments.service.js';
import { SeriesController } from './series/series.controller.js';
import { SeriesService } from './series/series.service.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { StorageService } from './storage/storage.service.js';
import { WebhooksController } from './payments/webhooks.controller.js';
import { WorkSourcesController } from './work-sources/work-sources.controller.js';
import { WorkSourcesService } from './work-sources/work-sources.service.js';

import { PLATFORM_LOCKED_FIELD_KEYS, registerReservedKeys } from '@gigalibs/configuration-core';
import { FormsEngineNestModule } from '@gigalibs/forms-engine-nest';
import { CustomFieldsNestModule } from '@gigalibs/custom-fields-nest';

/**
 * AR-owned field keys that must never be exposed as user-configurable.
 * Registered once at module init so compileConfiguration enforces them
 * for all configurations with moduleKey === 'accounts-receivable'.
 */
const AR_RESERVED_KEYS = [
  'currency',
  'total-minor',
  'tax-minor',
  'total',
  'subtotal-minor',
  'discount-minor',
  'due-date',
  'invoice-number',
  'customer-id',
  'billing-entity-id',
] as const;

/**
 * Combined locked-key set: platform-level + AR module reserved keys.
 * Passed to FormsEngineNestModule so tenants can never remove or retype these fields.
 */
const AR_LOCKED_KEYS = new Set<string>([
  ...PLATFORM_LOCKED_FIELD_KEYS,
  ...AR_RESERVED_KEYS,
]);

import { DatabaseModule } from './database/database.module.js';
import { arRecordDispatcher, idempotencyDatabase } from './records/ar-record-adapters.js';

const ArRecordController = createRecordController({
  guard: ArAuthorizationGuard,
  readPermission: 'ar:read',
});

@Module({
  imports: [
    DatabaseModule,
    /**
     * Universal runtime form definitions.
     * REST endpoints: GET/PUT/POST /forms/:key
     * Admin publishes a change → all users see it on next request, zero deployment.
     */
    FormsEngineNestModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) => ({
        pool: db.pool,
        schema: 'gigalibs_ar',
        lockedKeys: AR_LOCKED_KEYS,
      }),
    }),
    /**
     * Per-tenant custom field definitions persisted to gigalibs_ar.custom_field_definitions.
     */
    CustomFieldsNestModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) => ({
        pool: db.pool,
        schema: 'gigalibs_ar',
      }),
    }),
  ],
  controllers: [
    HealthController,
    SetupController,
    BillingEntityController,
    SeriesController,
    CustomersController,
    InvoicesController,
    DeliveriesController,
    PaymentsController,
    CreditNotesController,
    WorkSourcesController,
    WebhooksController,
    OidcDevController,
    ArRecordController,
  ],
  providers: [
    arConfigProvider,
    arModuleRuntimeConfigProvider,
    Reflector,
    DatabaseService,
    OidcAuthorizationGuard,
    {
      provide: PlatformArAuthorizationGuard,
      inject: [AR_MODULE_RUNTIME_CONFIG, DatabaseService],
      useFactory: (config: ModuleRuntimeConfig | null, database: DatabaseService) =>
        config ? new PlatformArAuthorizationGuard(config, database) : null,
    },
    ArAuthorizationGuard,
    SetupService,
    BillingEntityService,
    SeriesService,
    CustomersService,
    InvoicesService,
    StorageService,
    DeliveriesService,
    PaymentsService,
    CreditNotesService,
    WorkSourcesService,
    OidcDevService,
    {
      provide: RECORD_DISPATCHER,
      inject: [InvoicesService, CustomersService, DatabaseService],
      useFactory: (invoices: InvoicesService, customers: CustomersService, database: DatabaseService) =>
        arRecordDispatcher(
          { invoices, customers },
          new ModuleIdempotencyStore(idempotencyDatabase(database), {
            retentionDays: loadIdempotencyRetentionDays(process.env, 'AR'),
          }),
        ),
    },
  ],
})
export class AppModule implements OnModuleInit {
  onModuleInit(): void {
    registerReservedKeys('accounts-receivable', AR_RESERVED_KEYS);
  }
}
