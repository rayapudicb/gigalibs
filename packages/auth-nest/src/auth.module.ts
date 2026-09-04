import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

export interface AuthModuleOptions {
  globalGuard?: boolean;
}

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {
  static forRoot(options?: AuthModuleOptions): DynamicModule {
    const providers: unknown[] = [AuthService, JwtAuthGuard];

    if (options?.globalGuard !== false) {
      providers.push({
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      });
    }

    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: providers as any,
      exports: [AuthService, JwtAuthGuard],
    };
  }
}
