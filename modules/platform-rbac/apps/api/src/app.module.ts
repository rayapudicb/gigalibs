import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { PlatformController } from './platform/platform.controller.js';
import { PlatformService } from './platform/platform.service.js';
import { MarketplaceController } from './marketplace/marketplace.controller.js';
import { MarketplaceService } from './marketplace/marketplace.service.js';
import { RbacController } from './rbac/rbac.controller.js';
import { RbacService } from './rbac/rbac.service.js';
import { PlatformServiceAuthGuard } from './security/platform-service-auth.guard.js';

@Module({
  imports: [],
  controllers: [
    HealthController,
    PlatformController,
    MarketplaceController,
    RbacController,
  ],
  providers: [
    DatabaseService,
    PlatformService,
    MarketplaceService,
    RbacService,
    {
      provide: APP_GUARD,
      useClass: PlatformServiceAuthGuard,
    },
  ],
  exports: [DatabaseService],
})
export class AppModule {}
