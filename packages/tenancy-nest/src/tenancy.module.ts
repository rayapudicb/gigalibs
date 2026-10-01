import {
  Module,
  RequestMethod,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { TenancyService } from './tenancy.service.js';
import { TenantMiddleware } from './middleware/tenant.middleware.js';
import { TenancyController } from './tenancy.controller.js';
import { TenantBoundaryGuard } from './guards/tenant-boundary.guard.js';
import { PlatformAuthorityGuard } from './guards/platform-authority.guard.js';
import { PlatformAdministrationController } from './platform-administration.controller.js';
import { PlatformAdministrationService } from './platform-administration.service.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';

@Module({
  controllers: [TenancyController, PlatformAdministrationController, OrganizationController],
  providers: [
    TenancyService,
    TenantMiddleware,
    TenantBoundaryGuard,
    PlatformAuthorityGuard,
    PlatformAdministrationService,
    OrganizationService,
  ],
  exports: [
    TenancyService,
    TenantMiddleware,
    TenantBoundaryGuard,
    PlatformAuthorityGuard,
    PlatformAdministrationService,
    OrganizationService,
  ],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }

  static forRoot(): DynamicModule {
    return {
      module: TenancyModule,
      controllers: [TenancyController, PlatformAdministrationController, OrganizationController],
      providers: [
        TenancyService,
        TenantMiddleware,
        TenantBoundaryGuard,
        PlatformAuthorityGuard,
        PlatformAdministrationService,
        OrganizationService,
      ],
      exports: [
        TenancyService,
        TenantMiddleware,
        TenantBoundaryGuard,
        PlatformAuthorityGuard,
        PlatformAdministrationService,
        OrganizationService,
      ],
    };
  }
}
