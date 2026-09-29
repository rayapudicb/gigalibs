import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { type AnalyticsPrincipal, PlatformContextAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import { ModelCatalogService } from './model-catalog.service.js';

// WI-OI-103d: read-only catalog for the Explore screen. Shares the /v1/semantic-models prefix with the dataset module's
// create/get routes; these two paths do not overlap with them.
@Controller('v1/semantic-models')
@UseGuards(PlatformContextAuthorizationGuard)
export class ModelCatalogController {
  constructor(private readonly catalog: ModelCatalogService) {}

  /** GET /v1/semantic-models — the tenant's semantic models. */
  @Get()
  @RequirePermissions('analytics:read')
  listModels(@CurrentPrincipal() principal: AnalyticsPrincipal) {
    return this.catalog.listModels(principal);
  }

  /** GET /v1/semantic-models/:modelId/catalog — measures (base and approved formulas) and typed fields. */
  @Get(':modelId/catalog')
  @RequirePermissions('analytics:read')
  getCatalog(@CurrentPrincipal() principal: AnalyticsPrincipal, @Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.catalog.getCatalog(principal, modelId);
  }
}
