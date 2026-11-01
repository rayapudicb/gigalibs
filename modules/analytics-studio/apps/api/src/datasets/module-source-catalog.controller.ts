import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { PlatformContextAuthorizationGuard, Principal, RequirePermissions } from '../auth/authorization.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { SourceAccessService } from '../auth/source-access.service.js';
import { ModuleMeasureCompilerService } from './module-measure-compiler.service.js';

@Controller('v1/module-sources')
@UseGuards(PlatformContextAuthorizationGuard)
export class ModuleSourceCatalogController {
  constructor(
    private readonly compiler: ModuleMeasureCompilerService,
    private readonly sourceAccess: SourceAccessService,
  ) {}

  /** GET /v1/module-sources/:sourceId/catalog — contract-compiled measures and default views (WI-OI-131 B8). */
  @Get(':sourceId/catalog')
  @RequirePermissions('analytics:read')
  async getCatalog(
    @Principal() principal: AnalyticsPrincipal,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
  ) {
    await this.sourceAccess.assertAnalyticsSourceAccess(principal, sourceId);
    return this.compiler.getCatalog(principal, sourceId);
  }
}
