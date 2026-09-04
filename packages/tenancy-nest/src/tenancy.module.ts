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

@Module({
  controllers: [TenancyController],
  providers: [
    TenancyService,
    TenantMiddleware,
    TenantBoundaryGuard,
  ],
  exports: [TenancyService, TenantMiddleware, TenantBoundaryGuard],
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
      controllers: [TenancyController],
      providers: [
        TenancyService,
        TenantMiddleware,
        TenantBoundaryGuard,
      ],
      exports: [TenancyService, TenantMiddleware, TenantBoundaryGuard],
    };
  }
}
