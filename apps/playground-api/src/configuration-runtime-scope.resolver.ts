import {
  ConfigurationKeySchema,
  ConfigurationRuntimeScopeV1Schema,
  type ConfigurationRuntimeScopeV1,
} from '@gigalibs/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { configurationRuntimeError } from './configuration-runtime.error.js';

@Injectable()
export class ConfigurationRuntimeScopeResolver implements OnModuleInit {
  onModuleInit(): void {
    this.environmentKey();
  }

  resolve(entitlementModuleKey: string): ConfigurationRuntimeScopeV1 {
    return ConfigurationRuntimeScopeV1Schema.parse({
      contractVersion: '1.0',
      environmentKey: this.environmentKey(),
      cohortKey: 'all-users',
      policyKey: 'ALL_ENTITLED_USERS_V1',
      entitlementModuleKey,
      resolutionSource: 'SERVER_POLICY',
    });
  }

  assertLegacyAssertions(
    scope: ConfigurationRuntimeScopeV1,
    assertions: { environmentKey?: string; cohortKey?: string },
  ): void {
    if (
      (assertions.environmentKey !== undefined &&
        assertions.environmentKey !== scope.environmentKey) ||
      (assertions.cohortKey !== undefined && assertions.cohortKey !== scope.cohortKey)
    ) {
      throw configurationRuntimeError(
        'CONFIGURATION_RUNTIME_SCOPE_DENIED',
        'The requested runtime scope is not available.',
        false,
        403,
      );
    }
  }

  private environmentKey(): string {
    const parsed = ConfigurationKeySchema.safeParse(
      process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY,
    );
    if (!parsed.success) {
      throw configurationRuntimeError(
        'CONFIGURATION_RUNTIME_SCOPE_MISSING',
        'Runtime configuration is unavailable.',
        false,
        503,
      );
    }
    return parsed.data;
  }
}
