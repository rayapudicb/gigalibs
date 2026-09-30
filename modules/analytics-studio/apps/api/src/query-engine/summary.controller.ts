import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { type AnalyticsPrincipal, PlatformContextAuthorizationGuard, Principal, RequirePermissions } from '../auth/authorization.js';
import { SummaryService } from './summary.service.js';

/**
 * WI-OI-104e: builds, and waits for, the summaries a dataset version's saved charts and dashboards need. The kernel
 * chains it after a scheduled dataset build (`analytics.summaries-build`); it needs the same right as the build.
 */
@Controller('v1/datasets')
@UseGuards(PlatformContextAuthorizationGuard)
export class SummaryController {
  constructor(private readonly summaries: SummaryService) {}

  @Post(':datasetVersionId/summaries')
  @RequirePermissions('analytics:mappings:write')
  @HttpCode(HttpStatus.OK)
  async build(@Principal() principal: AnalyticsPrincipal, @Param('datasetVersionId', ParseUUIDPipe) datasetVersionId: string) {
    return { datasetVersionId, ...(await this.summaries.ensureForDatasetVersion(principal.tenantId, datasetVersionId)) };
  }
}
