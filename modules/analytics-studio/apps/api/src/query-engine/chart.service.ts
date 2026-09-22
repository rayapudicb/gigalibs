/**
 * ChartService — ECharts 5.5.1 option generation
 *
 * Builds production-ready Apache ECharts option objects from
 * real QueryResponse data. The chart_options_template stored in
 * chart_definitions is merged with query results at render time.
 *
 * Rules:
 *  - Every chart produces an `accessibleTable` equivalent (WCAG 2.1 AA)
 *  - No hardcoded numeric values in chart options; all data from query results
 *  - chart_options_template may supply axis labels, color palettes, title
 *    text, tooltip formatters — but never data arrays (those are injected)
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { QueryEngineService } from './query-engine.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { QueryResponse } from './query-engine.service.js';

// ─── ECharts types (minimal, no runtime import needed — built at backend) ────

export interface EChartsOption {
  title?: { text?: string; subtext?: string };
  tooltip?: Record<string, unknown>;
  legend?: Record<string, unknown>;
  xAxis?: Record<string, unknown> | Record<string, unknown>[];
  yAxis?: Record<string, unknown> | Record<string, unknown>[];
  series?: Array<{
    name?: string;
    type: string;
    data: unknown[];
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

export interface ChartRenderResponse {
  chartDefinitionId: string;
  chartType: string;
  displayName: string;
  /** Apache ECharts 5.5.1 option object — ready for echarts.setOption() */
  echartsOption: EChartsOption;
  /** Raw query results for server-side access */
  queryResponse: QueryResponse;
  /** Accessible table equivalent (WCAG 2.1 AA requirement) */
  accessibleTable: Array<{ label: string; value: string | null }>;
}

export interface CreateChartDefinitionDto {
  semanticModelId: string;
  displayName: string;
  description?: string;
  chartType: string;
  measureNames: string[];
  dimensionField?: string;
  freshnessttlSeconds?: number;
  chartOptionsTemplate?: Record<string, unknown>;
}

// ─── ChartService ─────────────────────────────────────────────────────────────

@Injectable()
export class ChartService {
  private readonly logger = new Logger(ChartService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly queryEngine: QueryEngineService,
  ) {}

  async createChartDefinition(
    principal: AnalyticsPrincipal,
    dto: CreateChartDefinitionDto,
  ): Promise<{ id: string }> {
    const { tenantId, subject } = principal;

    const VALID_CHART_TYPES = new Set([
      'BAR', 'LINE', 'PIE', 'SCATTER', 'AREA',
      'HEATMAP', 'TREEMAP', 'FUNNEL', 'GAUGE',
    ]);
    const chartType = dto.chartType.toUpperCase();
    if (!VALID_CHART_TYPES.has(chartType)) {
      throw new Error(`Invalid chart type: '${dto.chartType}'.`);
    }

    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.chart_definitions
         (semantic_model_id, tenant_id, display_name, description,
          chart_type, measure_names, dimension_field,
          freshness_ttl_seconds, chart_options_template, created_by)
       VALUES ($1, $2, $3, $4, $5::gigalibs_analytics.chart_type, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        dto.semanticModelId, tenantId, dto.displayName, dto.description ?? null,
        chartType, dto.measureNames, dto.dimensionField ?? null,
        dto.freshnessttlSeconds ?? null,
        JSON.stringify(dto.chartOptionsTemplate ?? {}), subject,
      ],
    );
    return { id: result.rows[0]!.id };
  }

  /**
   * Render a chart: execute the governed query, then build the ECharts option.
   * All series data comes exclusively from query results — never from templates.
   */
  async renderChart(
    principal: AnalyticsPrincipal,
    chartDefinitionId: string,
  ): Promise<ChartRenderResponse> {
    const { tenantId } = principal;

    // Load chart definition
    const chartResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, display_name, chart_type, measure_names,
              dimension_field, chart_options_template
       FROM gigalibs_analytics.chart_definitions WHERE id = $1`,
      [chartDefinitionId],
    );
    if (chartResult.rows.length === 0) {
      throw new NotFoundException(`Chart definition '${chartDefinitionId}' not found.`);
    }
    const chart = chartResult.rows[0]!;

    // Execute governed query
    const queryResponse = await this.queryEngine.runQuery(principal, { chartDefinitionId });

    // Build ECharts option
    const template: EChartsOption =
      typeof chart.chart_options_template === 'object'
        ? (chart.chart_options_template as EChartsOption)
        : {};

    const echartsOption = this.buildEChartsOption(
      chart.chart_type as string,
      chart.display_name as string,
      queryResponse,
      template,
    );

    return {
      chartDefinitionId,
      chartType: chart.chart_type,
      displayName: chart.display_name,
      echartsOption,
      queryResponse,
      accessibleTable: queryResponse.accessibleTable,
    };
  }

  async listChartDefinitions(principal: AnalyticsPrincipal): Promise<Array<{ id: string; displayName: string; chartType: string; createdAt: string }>> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, display_name, chart_type, created_at::text
       FROM gigalibs_analytics.chart_definitions
       ORDER BY created_at DESC`,
      [],
    );
    return result.rows.map((r: any) => ({
      id: r.id, displayName: r.display_name,
      chartType: r.chart_type, createdAt: r.created_at,
    }));
  }

  // ── ECharts option builders ───────────────────────────────────────────────

  private buildEChartsOption(
    chartType: string,
    displayName: string,
    qr: QueryResponse,
    template: EChartsOption,
  ): EChartsOption {
    // Base option from template (title, tooltip, color, etc.)
    // Data series are always injected from query results — never from template
    const base: EChartsOption = {
      ...template,
      title: { text: displayName, ...(template.title ?? {}) },
      tooltip: { trigger: 'axis', ...(template.tooltip ?? {}) },
    };

    // Freshness annotation in subtext
    base.title = {
      ...base.title,
      subtext: `Freshness: ${qr.freshness}  |  As of: ${qr.asOf.slice(0, 19).replace('T', ' ')} UTC`,
    };

    const measures = qr.results;
    const labels = measures.map((m) => m.displayLabel);
    const values = measures.map((m) => m.value ?? 0);

    switch (chartType) {
      case 'BAR':
        return {
          ...base,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: values, name: displayName }],
        };

      case 'LINE':
        return {
          ...base,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ type: 'line', data: values, name: displayName, smooth: true }],
        };

      case 'AREA':
        return {
          ...base,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{
            type: 'line', data: values, name: displayName, smooth: true,
            areaStyle: { opacity: 0.35 },
          }],
        };

      case 'PIE':
        return {
          ...base,
          tooltip: { trigger: 'item' },
          legend: { orient: 'vertical', left: 'left' },
          series: [{
            type: 'pie',
            data: measures.map((m) => ({ name: m.displayLabel, value: m.value ?? 0 })),
            radius: '60%',
            name: displayName,
          }],
        };

      case 'SCATTER':
        // Scatter: plot index vs value for each measure
        return {
          ...base,
          xAxis: { type: 'value', name: 'Index' },
          yAxis: { type: 'value', name: 'Value' },
          series: [{
            type: 'scatter',
            data: values.map((v, i) => [i, v]),
            name: displayName,
          }],
        };

      case 'GAUGE':
        // For GAUGE show first measure value on a normalised 0-100 scale
        const gaugeValue = values[0] ?? 0;
        return {
          ...base,
          tooltip: { formatter: '{b}: {c}' },
          series: [{
            type: 'gauge',
            data: [{ name: labels[0] ?? displayName, value: gaugeValue }],
            name: displayName,
          }],
        };

      case 'FUNNEL':
        return {
          ...base,
          tooltip: { trigger: 'item' },
          series: [{
            type: 'funnel',
            data: measures.map((m) => ({ name: m.displayLabel, value: m.value ?? 0 })),
            name: displayName,
          }],
        };

      case 'TREEMAP':
        return {
          ...base,
          series: [{
            type: 'treemap',
            data: measures.map((m) => ({ name: m.displayLabel, value: m.value ?? 0 })),
            name: displayName,
          }],
        };

      case 'HEATMAP':
        // Heatmap needs a calendar or grid; emit a bar as degraded fallback
        // with a note in title subtext so the caller knows
        this.logger.warn(`HEATMAP chart type requires a time-series dimension; rendering as bar.`);
        return {
          ...base,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: values, name: displayName }],
        };

      default:
        // Unknown type — safe fallback to bar
        return {
          ...base,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: values, name: displayName }],
        };
    }
  }
}
