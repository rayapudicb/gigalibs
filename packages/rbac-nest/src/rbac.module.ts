import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { RbacService } from './rbac.service.js';
import { RbacGuard } from './guards/rbac.guard.js';

@Module({
  providers: [Reflector, RbacService, RbacGuard],
  exports: [RbacService, RbacGuard],
})
export class RbacModule {
  static forRoot(options: { globalGuard?: boolean } = {}): DynamicModule {
    const providers: Provider[] = [Reflector, RbacService, RbacGuard];
    if (options.globalGuard !== false) {
      providers.push({ provide: APP_GUARD, useClass: RbacGuard });
    }
    return {
      module: RbacModule,
      providers,
      exports: [RbacService, RbacGuard],
    };
  }
}
