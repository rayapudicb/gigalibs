import { GLOBAL_MODULE_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PlatformContextAuthorizationGuard } from './auth/authorization.js';
import { AppModule } from './app.module.js';
import { ConfigProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { AnalyticsRuntimeModule } from './runtime.module.js';

describe('Analytics runtime module boundary', () => {
  it('publishes one global fail-closed runtime boundary to every feature module', () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, AnalyticsRuntimeModule)).toBe(true);

    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AnalyticsRuntimeModule);
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AnalyticsRuntimeModule);
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);

    expect(providers).toEqual(
      expect.arrayContaining([ConfigProvider, DatabaseService, PlatformContextAuthorizationGuard]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([ConfigProvider, DatabaseService, PlatformContextAuthorizationGuard]),
    );
    expect(appImports).toContain(AnalyticsRuntimeModule);
  });
});
