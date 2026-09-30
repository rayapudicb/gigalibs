import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatasetService, BuildDatasetDto } from './dataset.service.js';

// ─── Analytical Dataset Controller ───────────────────────────────────────────

@Controller('v1/datasets')
@UseGuards(PlatformContextAuthorizationGuard)
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  /**
   * POST /v1/datasets/build
   * Trigger a new dataset build from a PUBLISHED mapping version.
   * Required scope: analytics:datasets:write
   */
  @Post('build')
  @RequirePermissions('analytics:mappings:write')
  @HttpCode(HttpStatus.ACCEPTED) // 202 — build is async within the request
  async buildDataset(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: BuildDatasetDto,
  ) {
    return this.datasetService.buildDatasetVersion(principal, dto);
  }

  /**
   * GET /v1/datasets/:datasetVersionId
   * Retrieve a specific dataset version by id.
   * Required scope: analytics:datasets:read
   */
  @Get(':datasetVersionId')
  @RequirePermissions('analytics:read')
  async getDatasetVersion(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('datasetVersionId') datasetVersionId: string,
  ) {
    return this.datasetService.getDatasetVersion(principal, datasetVersionId);
  }

  /**
   * GET /v1/datasets/by-mapping/:mappingId
   * List all dataset versions for a given mapping.
   * Required scope: analytics:datasets:read
   */
  @Get('by-mapping/:mappingId')
  @RequirePermissions('analytics:read')
  async listDatasetVersions(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('mappingId') mappingId: string,
  ) {
    return this.datasetService.listDatasetVersions(principal, mappingId);
  }
}
