import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { MfaAssistedRecoveryService } from './mfa-assisted-recovery.service.js';
import { MobileAuthController } from './mobile/mobile-auth.controller.js';
import { MobileAuthService } from './mobile/mobile-auth.service.js';
import { MobileCalibrationController } from './mobile/mobile-calibration.controller.js';
import { MobileCommissioningController } from './mobile/mobile-commissioning.controller.js';
import { MobileFleetController } from './mobile/mobile-fleet.controller.js';
import { MobileLogbookController } from './mobile/mobile-logbook.controller.js';
import { MobilePermitsController } from './mobile/mobile-permits.controller.js';
import { MobileRequestsController } from './mobile/mobile-requests.controller.js';
import { MobileContractorController } from './mobile/mobile-contractor.controller.js';
import { MobileSafetyController } from './mobile/mobile-safety.controller.js';
import { MobileSopController } from './mobile/mobile-sop.controller.js';
import { PublicCmmsPortalController } from './portal/public-cmms-portal.controller.js';
import { MobileSparesController } from './mobile/mobile-spares.controller.js';
import { MobileRoundsController } from './mobile/mobile-rounds.controller.js';
import { OidcService } from './oidc.service.js';

export interface AuthModuleOptions {
  globalGuard?: boolean;
}

@Module({
  controllers: [AuthController, MobileAuthController, MobileRoundsController, MobileCalibrationController, MobileCommissioningController, MobileSparesController, MobileLogbookController, MobileSopController, MobileFleetController, MobileRequestsController, MobileSafetyController, MobileContractorController, MobilePermitsController, PublicCmmsPortalController],
  providers: [Reflector, AuthService, OidcService, MfaAssistedRecoveryService, MobileAuthService, JwtAuthGuard],
  exports: [AuthService, OidcService, MfaAssistedRecoveryService, JwtAuthGuard],
})
export class AuthModule {
  static forRoot(options?: AuthModuleOptions): DynamicModule {
    const providers: unknown[] = [
      Reflector,
      AuthService,
      OidcService,
      MfaAssistedRecoveryService,
      MobileAuthService,
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
      controllers: [AuthController, MobileAuthController, MobileRoundsController, MobileCalibrationController, MobileCommissioningController, MobileSparesController, MobileLogbookController, MobileSopController, MobileFleetController, MobileRequestsController, MobileSafetyController, MobileContractorController, MobilePermitsController, PublicCmmsPortalController],
      providers: providers as any,
      exports: [AuthService, OidcService, MfaAssistedRecoveryService, JwtAuthGuard],
    };
  }
}
