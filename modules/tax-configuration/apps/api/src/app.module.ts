import { Module } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';
import { JurisdictionsController } from './jurisdictions/jurisdictions.controller.js';
import { JurisdictionsService } from './jurisdictions/jurisdictions.service.js';
import { RatesController } from './rates/rates.controller.js';
import { RatesService } from './rates/rates.service.js';
import { ExemptionsController } from './exemptions/exemptions.controller.js';
import { ExemptionsService } from './exemptions/exemptions.service.js';
import { CalculateController } from './calculate/calculate.controller.js';
import { CalculateService } from './calculate/calculate.service.js';
import { MonitorController } from './monitor/monitor.controller.js';
import { MonitorService } from './monitor/monitor.service.js';
import { HealthController } from './health/health.controller.js';
import { taxConfigProvider } from './config.provider.js';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { InboxModule } from './inbox/inbox.module.js';

@Module({
  imports: [InboxModule],
  controllers: [
    HealthController,
    OidcDevController,
    SetupController,
    JurisdictionsController,
    RatesController,
    ExemptionsController,
    CalculateController,
    MonitorController,
  ],
  providers: [
    taxConfigProvider,
    DatabaseService,
    OidcAuthorizationGuard,
    OidcDevService,
    SetupService,
    JurisdictionsService,
    RatesService,
    ExemptionsService,
    CalculateService,
    MonitorService,
  ],
  exports: [DatabaseService],
})
export class AppModule {}
