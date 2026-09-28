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
import { PlatformContextAuthorizationGuard } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { QueryEngineService, RunQueryDto } from './query-engine.service.js';
import { ChartService, CreateChartDefinitionDto } from './chart.service.js';
import { DashboardService, CreateDashboardDto, AddChartToDashboardDto } from './dashboard.service.js';

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
  @HttpCode(HttpStatus.OK)
  async runQuery(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: RunQueryDto,
  ) {
    return this.queryEngine.runQuery(principal, dto);
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
  async listCharts(@CurrentPrincipal() principal: AnalyticsPrincipal) {
    return this.chartService.listChartDefinitions(principal);
  }

  /**
   * GET /v1/charts/:chartId/render
   * Execute query and return ECharts option + accessible table.
   * Required scope: analytics:charts:read
   */
  @Get(':chartId/render')
  async renderChart(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('chartId') chartId: string,
  ) {
    return this.chartService.renderChart(principal, chartId);
  }
}

// ─── Dashboards Controller ────────────────────────────────────────────────────

@Controller('v1/dashboards')
@UseGuards(PlatformContextAuthorizationGuard)
export class DashboardsController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * POST /v1/dashboards
   * Required scope: analytics:dashboards:write
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDashboard(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: CreateDashboardDto,
  ) {
    return this.dashboardService.createDashboard(principal, dto);
  }

  /**
   * GET /v1/dashboards
   * Required scope: analytics:dashboards:read
   */
  @Get()
  async listDashboards(@CurrentPrincipal() principal: AnalyticsPrincipal) {
    return this.dashboardService.listDashboards(principal);
  }

  /**
   * GET /v1/dashboards/:dashboardId
   * Required scope: analytics:dashboards:read
   */
  @Get(':dashboardId')
  async getDashboard(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('dashboardId') dashboardId: string,
  ) {
    return this.dashboardService.getDashboard(principal, dashboardId);
  }

  /**
   * POST /v1/dashboards/:dashboardId/charts
   * Required scope: analytics:dashboards:write
   */
  @Post(':dashboardId/charts')
  @HttpCode(HttpStatus.CREATED)
  async addChart(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('dashboardId') dashboardId: string,
    @Body() dto: AddChartToDashboardDto,
  ) {
    return this.dashboardService.addChartToDashboard(principal, dashboardId, dto);
  }
}
