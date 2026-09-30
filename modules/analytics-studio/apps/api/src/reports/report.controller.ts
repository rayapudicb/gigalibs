import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  CreateReportDefinitionDto,
  TriggerReportRunDto,
  CreateScheduleDto,
} from './report.service.js';

@Controller('v1/reports')
@UseGuards(PlatformContextAuthorizationGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * POST /v1/reports/definitions
   * Create a report definition with pinned inputs.
   * Required scope: analytics:reports:write
   */
  @Post('definitions')
  @RequirePermissions('analytics:reports:write')
  @HttpCode(HttpStatus.CREATED)
  async createDefinition(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: CreateReportDefinitionDto,
  ) {
    return this.reportService.createReportDefinition(principal, dto);
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
   * POST /v1/reports/schedules
   * Create a scheduled delivery for a report definition.
   * Required scope: analytics:reports:write
   */
  @Post('schedules')
  @RequirePermissions('analytics:reports:write')
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.reportService.createSchedule(principal, dto);
  }
}
