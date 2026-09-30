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
import { QueryEngineService, RunQueryDto } from './query-engine.service.js';
import { ChartService, CreateChartDefinitionDto } from './chart.service.js';

// ─── Query Engine Controller ──────────────────────────────────────────────────

@Controller('v1/query')
@UseGuards(PlatformContextAuthorizationGuard)
export class QueryEngineController {
  constructor(private readonly queryEngine: QueryEngineService) {}

  /**
   * POST /v1/query/run
   * Execute a governed query for a chart definition.
   * Required scope: analytics:query:read
   */
  @Post('run')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async runQuery(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: RunQueryDto,
  ) {
    return this.queryEngine.runQuery(principal, dto);
  }

  /**
   * POST /v1/query/spec (WI-OI-103a)
   * Run an AnalyticsQueryV1: measures by dimensions, per time grain, filtered and sorted. Returns typed rows.
   */
  @Post('spec')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('analytics:read')
  async runSpec(@CurrentPrincipal() principal: AnalyticsPrincipal, @Body() body: unknown) {
    return this.queryEngine.runSpec(principal, body);
  }
}

// ─── Charts Controller ────────────────────────────────────────────────────────

@Controller('v1/charts')
@UseGuards(PlatformContextAuthorizationGuard)
export class ChartsController {
  constructor(private readonly chartService: ChartService) {}

  /**
   * POST /v1/charts
   * Create a chart definition backed by a semantic model.
   * Required scope: analytics:charts:write
   */
  @Post()
  @RequirePermissions('analytics:charts:write')
  @HttpCode(HttpStatus.CREATED)
  async createChartDefinition(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: CreateChartDefinitionDto,
  ) {
    return this.chartService.createChartDefinition(principal, dto);
  }

  /**
   * GET /v1/charts
   * List chart definitions for the tenant.
   * Required scope: analytics:charts:read
   */
  @Get()
  @RequirePermissions('analytics:read')
  async listCharts(@CurrentPrincipal() principal: AnalyticsPrincipal) {
    return this.chartService.listChartDefinitions(principal);
  }

  /**
   * GET /v1/charts/:chartId/render
   * Execute query and return ECharts option + accessible table.
   * Required scope: analytics:charts:read
   */
  @Get(':chartId/render')
  @RequirePermissions('analytics:read')
  async renderChart(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('chartId') chartId: string,
  ) {
    return this.chartService.renderChart(principal, chartId);
  }
}
