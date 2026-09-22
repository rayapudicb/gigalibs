import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

export interface CreateDashboardDto {
  displayName: string;
  description?: string;
}

export interface AddChartToDashboardDto {
  chartDefinitionId: string;
  gridCol?: number;
  gridRow?: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface DashboardSummary {
  id: string;
  tenantId: string;
  displayName: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  charts: Array<{
    dashboardChartId: string;
    chartDefinitionId: string;
    chartType: string;
    displayName: string;
    gridCol: number;
    gridRow: number;
    colSpan: number;
    rowSpan: number;
  }>;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly db: DatabaseService) {}

  async createDashboard(
    principal: AnalyticsPrincipal,
    dto: CreateDashboardDto,
  ): Promise<{ id: string }> {
    const { tenantId, subject } = principal;
    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.dashboards
         (tenant_id, display_name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tenantId, dto.displayName, dto.description ?? null, subject],
    );
    this.logger.log(`[tenant:${tenantId}] Created dashboard '${result.rows[0]!.id}'`);
    return { id: result.rows[0]!.id };
  }

  async addChartToDashboard(
    principal: AnalyticsPrincipal,
    dashboardId: string,
    dto: AddChartToDashboardDto,
  ): Promise<{ id: string }> {
    const { tenantId } = principal;

    // Verify dashboard exists
    const dash = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `SELECT id FROM gigalibs_analytics.dashboards WHERE id = $1`,
      [dashboardId],
    );
    if (dash.rows.length === 0) throw new NotFoundException(`Dashboard '${dashboardId}' not found.`);

    // Compute next sort_order
    const sortResult = await this.db.queryWithTenant<{ max: string | null }>(
      tenantId,
      `SELECT MAX(sort_order) AS max FROM gigalibs_analytics.dashboard_charts WHERE dashboard_id = $1`,
      [dashboardId],
    );
    const nextSort = Number(sortResult.rows[0]?.max ?? -1) + 1;

    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.dashboard_charts
         (dashboard_id, chart_definition_id, tenant_id,
          grid_col, grid_row, col_span, row_span, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        dashboardId, dto.chartDefinitionId, tenantId,
        dto.gridCol ?? 0, dto.gridRow ?? nextSort,
        dto.colSpan ?? 6, dto.rowSpan ?? 4, nextSort,
      ],
    );
    return { id: result.rows[0]!.id };
  }

  async getDashboard(
    principal: AnalyticsPrincipal,
    dashboardId: string,
  ): Promise<DashboardSummary> {
    const { tenantId } = principal;
    const dash = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, tenant_id, display_name, description, created_by, created_at::text
       FROM gigalibs_analytics.dashboards WHERE id = $1`,
      [dashboardId],
    );
    if (dash.rows.length === 0) throw new NotFoundException(`Dashboard '${dashboardId}' not found.`);

    const d = dash.rows[0]!;
    const charts = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT dc.id, dc.chart_definition_id, dc.grid_col, dc.grid_row,
              dc.col_span, dc.row_span, cd.chart_type, cd.display_name
       FROM gigalibs_analytics.dashboard_charts dc
       JOIN gigalibs_analytics.chart_definitions cd ON cd.id = dc.chart_definition_id
       WHERE dc.dashboard_id = $1
       ORDER BY dc.sort_order`,
      [dashboardId],
    );
    return {
      id: d.id, tenantId: d.tenant_id,
      displayName: d.display_name, description: d.description ?? null,
      createdBy: d.created_by, createdAt: d.created_at,
      charts: charts.rows.map((c: any) => ({
        dashboardChartId: c.id, chartDefinitionId: c.chart_definition_id,
        chartType: c.chart_type, displayName: c.display_name,
        gridCol: c.grid_col, gridRow: c.grid_row,
        colSpan: c.col_span, rowSpan: c.row_span,
      })),
    };
  }

  async listDashboards(principal: AnalyticsPrincipal): Promise<Array<{ id: string; displayName: string; createdAt: string }>> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, display_name, created_at::text FROM gigalibs_analytics.dashboards ORDER BY created_at DESC`,
      [],
    );
    return result.rows.map((r: any) => ({ id: r.id, displayName: r.display_name, createdAt: r.created_at }));
  }
}
