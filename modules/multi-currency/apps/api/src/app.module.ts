import { Module } from '@nestjs/common';
import { currencyConfigProvider } from './config.provider.js';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { ConvertController } from './convert/convert.controller.js';
import { ConvertService } from './convert/convert.service.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { HedgingController } from './hedging/hedging.controller.js';
import { HedgingService } from './hedging/hedging.service.js';
import { PairsController } from './pairs/pairs.controller.js';
import { PairsService } from './pairs/pairs.service.js';
import { PreferencesController } from './preferences/preferences.controller.js';
import { PreferencesService } from './preferences/preferences.service.js';
import { RevaluationController } from './revaluation/revaluation.controller.js';
import { RevaluationService } from './revaluation/revaluation.service.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { InboxModule } from './inbox/inbox.module.js';

@Module({
  imports: [InboxModule],
  controllers: [
    HealthController,
    SetupController,
    PairsController,
    ConvertController,
    PreferencesController,
    HedgingController,
    RevaluationController,
    OidcDevController,
  ],
  providers: [
    currencyConfigProvider,
    DatabaseService,
    SetupService,
    PairsService,
    ConvertService,
    PreferencesService,
    HedgingService,
    RevaluationService,
    OidcDevService,
    OidcAuthorizationGuard,
  ],
  exports: [
    currencyConfigProvider,
    DatabaseService,
    SetupService,
    PairsService,
    ConvertService,
    PreferencesService,
    HedgingService,
    RevaluationService,
  ],
})
export class AppModule {}
