import { ModuleDatabase, type ModuleRuntimeConfig } from '@gigalibs/module-sdk';
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AR_CONFIG } from '../config.provider.js';
import {
  AR_MODULE_RUNTIME_CONFIG,
  SCHEMA,
  SCHEMA_CONTRACT_VERSION,
} from '../config.module-sdk.js';
import type { ArRuntimeConfig } from '../runtime-config.js';

/** AR has no SECURITY DEFINER relay functions on the standalone service yet (WI-OI-120hb). */
export const AR_DEFINER_FUNCTIONS = [] as const;

export type ArDefinerFunction = (typeof AR_DEFINER_FUNCTIONS)[number];

@Injectable()
export class DatabaseService
  extends ModuleDatabase<ArDefinerFunction>
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(AR_MODULE_RUNTIME_CONFIG) moduleConfig: ModuleRuntimeConfig | null,
    @Inject(AR_CONFIG) arConfig: ArRuntimeConfig,
  ) {
    super({
      label: 'Accounts Receivable',
      schema: SCHEMA,
      databaseUrl: moduleConfig?.databaseUrl ?? arConfig.databaseUrl,
      poolSize: moduleConfig?.databasePoolSize ?? arConfig.databasePoolSize,
      expectedMigrationVersion:
        moduleConfig?.expectedMigrationVersion ?? SCHEMA_CONTRACT_VERSION,
      definerFunctions: AR_DEFINER_FUNCTIONS,
      tenantBinding: 'set-local',
      poolOptions: { statement_timeout: 15_000, application_name: 'gigalibs-ar-api' },
    });
  }

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
  }

  override async onModuleDestroy(): Promise<void> {
    await super.onModuleDestroy();
  }

  /** Health probe used by {@link ../health/health.controller.ts}. */
  async isReady(): Promise<boolean> {
    try {
      await this.readiness();
      return true;
    } catch {
      return false;
    }
  }
}
