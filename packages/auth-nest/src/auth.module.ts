import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { MfaAssistedRecoveryService } from './mfa-assisted-recovery.service.js';
import { OidcService } from './oidc.service.js';

export interface AuthModuleOptions {
  globalGuard?: boolean;
}

@Module({
  controllers: [AuthController],
  providers: [AuthService, OidcService, MfaAssistedRecoveryService, JwtAuthGuard],
  exports: [AuthService, OidcService, MfaAssistedRecoveryService, JwtAuthGuard],
})
export class AuthModule {
  static forRoot(options?: AuthModuleOptions): DynamicModule {
    const providers: unknown[] = [
      AuthService,
      OidcService,
      MfaAssistedRecoveryService,
      JwtAuthGuard,
    ];

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
      exports: [AuthService, OidcService, MfaAssistedRecoveryService, JwtAuthGuard],
    };
  }
}
