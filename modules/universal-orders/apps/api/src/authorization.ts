import { type ModuleRuntimeConfig, SignedContextGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { MODULE_KEY, PERMISSION_PREFIX, RUNTIME_CONFIG } from './config.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AuthorizationGuard extends SignedContextGuardBase {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig, database: DatabaseService) {
    super(
      {
        label: 'Universal Orders',
        moduleKey: MODULE_KEY,
        entitlementName: 'Universal Orders',
        permissionPrefix: PERMISSION_PREFIX,
        publicKey: config.platformContextPublicKey,
        audience: config.platformContextAudience,
      },
      database,
    );
  }
}
