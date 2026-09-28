import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { BudgetsController } from './budgets/budgets.controller.js';
import { BudgetsService } from './budgets/budgets.service.js';
import { spendConfigProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { ExpensesController } from './expenses/expenses.controller.js';
import { ExpensesService } from './expenses/expenses.service.js';
import { HealthController } from './health/health.controller.js';
import { ImprestController } from './imprest/imprest.controller.js';
import { ImprestService } from './imprest/imprest.service.js';
import { SubscriptionsController } from './subscriptions/subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions/subscriptions.service.js';
import { TravelController } from './travel/travel.controller.js';
import { TravelService } from './travel/travel.service.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';

@Module({
  controllers: [
    HealthController,
    OidcDevController,
    SetupController,
    BudgetsController,
    ExpensesController,
    TravelController,
    ImprestController,
    SubscriptionsController,
    AnalyticsController,
  ],
  providers: [
    spendConfigProvider,
    DatabaseService,
    OidcDevService,
    SetupService,
    OidcAuthorizationGuard,
    BudgetsService,
    ExpensesService,
    TravelService,
    ImprestService,
    SubscriptionsService,
    AnalyticsService,
  ],
})
export class AppModule {}
