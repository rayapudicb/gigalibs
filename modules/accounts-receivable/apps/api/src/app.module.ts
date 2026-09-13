import { Module, OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OidcAuthorizationGuard } from './auth/authorization.js';
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

import { registerReservedKeys } from '@gigalibs/configuration-core';

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

@Module({
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
    OidcDevController,
  ],
  providers: [
    arConfigProvider,
    Reflector,
    DatabaseService,
    OidcAuthorizationGuard,
    SetupService,
    BillingEntityService,
    SeriesService,
    CustomersService,
    InvoicesService,
    DeliveriesService,
    PaymentsService,
    CreditNotesService,
    OidcDevService,
  ],
})
export class AppModule implements OnModuleInit {
  onModuleInit(): void {
    registerReservedKeys('accounts-receivable', AR_RESERVED_KEYS);
  }
}
