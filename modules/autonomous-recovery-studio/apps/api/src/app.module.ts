import { Module } from '@nestjs/common';
import { ConfigProvider } from './config.provider.js';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { LeaksController } from './leaks/leaks.controller.js';
import { LeaksService } from './leaks/leaks.service.js';
import { ScannerController } from './scanner/scanner.controller.js';
import { ScannerService } from './scanner/scanner.service.js';
import { ClaimsController } from './claims/claims.controller.js';
import { ClaimsService } from './claims/claims.service.js';

@Module({
  imports: [],
  controllers: [
    HealthController,
    SetupController,
    LeaksController,
    ScannerController,
    ClaimsController,
    OidcDevController,
  ],
  providers: [
    ConfigProvider,
    DatabaseService,
    SetupService,
    LeaksService,
    ScannerService,
    ClaimsService,
    OidcDevService,
    OidcAuthorizationGuard,
  ],
  exports: [
    ConfigProvider,
    DatabaseService,
    SetupService,
    LeaksService,
    ScannerService,
    ClaimsService,
  ],
})
export class AppModule {}
