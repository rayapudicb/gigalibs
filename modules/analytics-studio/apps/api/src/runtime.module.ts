import { Global, Module } from '@nestjs/common';
import { PlatformContextAuthorizationGuard } from './auth/authorization.js';
import { ConfigProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';

/**
 * Process-wide runtime dependencies shared by every Analytics feature module.
 *
 * Nest modules are encapsulated: providers registered only on AppModule are
 * not visible to modules imported by AppModule. Keeping configuration,
 * persistence and the authorization guard in one global module guarantees a
 * single database pool and makes those fail-closed boundaries available to
 * every feature module without circular imports.
 */
@Global()
@Module({
  providers: [ConfigProvider, DatabaseService, PlatformContextAuthorizationGuard],
  exports: [ConfigProvider, DatabaseService, PlatformContextAuthorizationGuard],
})
export class AnalyticsRuntimeModule {}
