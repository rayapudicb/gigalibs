import { SignedContextGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { IOT_CONFIG } from '../config.provider.js';
import type { IotRuntimeConfig } from '../runtime-config.js';

export const IOT_MODULE_KEY = 'iot-gateway';

@Injectable()
export class IotAuthorizationGuard extends SignedContextGuardBase {
  constructor(@Inject(DatabaseService) database: DatabaseService, @Inject(IOT_CONFIG) config: IotRuntimeConfig) {
    super(
      {
        label: 'IoT Gateway',
        moduleKey: IOT_MODULE_KEY,
        entitlementName: 'IoT Gateway',
        permissionPrefix: 'iot',
        publicKey: config.platformContextPublicKey,
        audience: config.platformContextAudience,
      },
      database,
    );
  }
}

export { CurrentPrincipal, RequirePermissions, type ModulePrincipal as IotPrincipal } from '@gigalibs/module-sdk';
