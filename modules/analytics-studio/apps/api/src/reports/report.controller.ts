import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

interface ReportResponse {
  setHeader(name: string, value: string): void;
  status(code: number): {
    send(body: unknown): void;
  };
}
import {
  ReportService,
  TriggerReportRunDto,
} from './report.service.js';

@Controller('v1/reports')
@UseGuards(PlatformContextAuthorizationGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * POST /v1/reports/definitions
   * Create a report from a saved chart view or a dashboard (WI-OI-103e).
   * Required scope: analytics:reports:write
   */
  @Post('definitions')
  @RequirePermissions('analytics:reports:write')
  @HttpCode(HttpStatus.CREATED)
  async createDefinition(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() body: unknown,
  ) {
    return this.reportService.createReportDefinition(principal, body);
  }

  /**
   * PATCH /v1/reports/definitions/:definitionId/formats
   * Update chosen formats for a report definition (WI-OI-106).
   * Required scope: analytics:reports:write
   */
  @Patch('definitions/:definitionId/formats')
  @RequirePermissions('analytics:reports:write')
  async updateFormats(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() body: unknown,
  ) {
    return this.reportService.updateReportFormats(principal, definitionId, body);
  }

  /** GET /v1/reports/definitions — the tenant's reports with their last run. */
  @Get('definitions')
  @RequirePermissions('analytics:read')
  async listDefinitions(@CurrentPrincipal() principal: AnalyticsPrincipal) {
    return this.reportService.listReportDefinitions(principal);
  }

  /** GET /v1/reports/definitions/:definitionId */
  @Get('definitions/:definitionId')
  @RequirePermissions('analytics:read')
  async getDefinition(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
  ) {
    return this.reportService.getReportDefinition(principal, definitionId);
  }

  /**
   * POST /v1/reports/runs
   * Trigger a report run (idempotent via idempotencyKey).
   * Required scope: analytics:reports:write
   */
  @Post('runs')
  @RequirePermissions('analytics:reports:write')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRun(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: TriggerReportRunDto,
  ) {
    return this.reportService.triggerReportRun(principal, dto);
  }

  /**
   * GET /v1/reports/runs/:runId
   * Required scope: analytics:reports:read
   */
  @Get('runs/:runId')
  @RequirePermissions('analytics:read')
  async getRun(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('runId') runId: string,
  ) {
    return this.reportService.getReportRun(principal, runId);
  }

  /**
   * GET /v1/reports/definitions/:definitionId/runs
   * List runs for a definition.
   * Required scope: analytics:reports:read
   */
  @Get('definitions/:definitionId/runs')
  @RequirePermissions('analytics:read')
  async listRuns(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('definitionId') definitionId: string,
  ) {
    return this.reportService.listReportRuns(principal, definitionId);
  }

  /**
   * GET /v1/reports/download/:token
   * Download a CSV artifact by short-lived token.
   * Returns the CSV bytes as an attachment.
   * Token is short-lived (15 min) and expires with 410 Gone.
   * Required scope: analytics:reports:read
   */
  @Get('download/:token')
  @RequirePermissions('analytics:export')
  async downloadArtifact(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('token') token: string,
    @Res() res: ReportResponse,
  ) {
    const result = await this.reportService.downloadArtifact(principal, token);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('X-Content-SHA256', result.contentSha256);
    res.setHeader('Content-Length', String(result.bytes.length));
    // Prevent caching of download responses
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(result.bytes);
  }

  /**
   * POST /v1/reports/runs/:runId/files/:format/download-token
   * Issue a fresh 15-minute download token for a report artifact (WI-OI-106).
   * Required scope: analytics:export
   */
  @Post('runs/:runId/files/:format/download-token')
  @RequirePermissions('analytics:export')
  @HttpCode(HttpStatus.OK)
  async createDownloadToken(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('runId') runId: string,
    @Param('format') format: string,
  ) {
    return this.reportService.generateDownloadToken(principal, runId, format);
  }
}
