import { type ModuleRuntimeConfig, SignedContextGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIENCE, MODULE_KEY, RUNTIME_CONFIG } from './config.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AuthorizationGuard extends SignedContextGuardBase {
  constructor(@Inject(RUNTIME_CONFIG) config: ModuleRuntimeConfig, database: DatabaseService) {
    super({
      label: 'GigaLibs Assistant',
      moduleKey: MODULE_KEY,
      entitlementName: 'GigaLibs Assistant',
      permissionPrefix: 'assistant',
      publicKey: config.platformContextPublicKey,
      audience: AUDIENCE,
    }, database);
  }
}
