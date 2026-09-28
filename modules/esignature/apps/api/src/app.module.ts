import { Module } from '@nestjs/common';
import { ConfigProvider } from './config.provider.js';
import { OidcAuthorizationGuard } from './auth/authorization.js';
import { OidcDevController } from './auth/oidc-dev.controller.js';
import { OidcDevService } from './auth/oidc-dev.service.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { SetupController } from './setup/setup.controller.js';
import { SetupService } from './setup/setup.service.js';
import { EnvelopesController } from './envelopes/envelopes.controller.js';
import { EnvelopesService } from './envelopes/envelopes.service.js';
import { SignaturesController } from './signatures/signatures.controller.js';
import { SignaturesService } from './signatures/signatures.service.js';

@Module({
  imports: [],
  controllers: [
    HealthController,
    SetupController,
    EnvelopesController,
    SignaturesController,
    OidcDevController,
  ],
  providers: [
    ConfigProvider,
    DatabaseService,
    SetupService,
    EnvelopesService,
    SignaturesService,
    OidcDevService,
    OidcAuthorizationGuard,
  ],
  exports: [
    ConfigProvider,
    DatabaseService,
    SetupService,
    EnvelopesService,
    SignaturesService,
  ],
})
export class AppModule {}
