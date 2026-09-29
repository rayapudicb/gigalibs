/**
 * Chart views (WI-OI-103d): saved questions plus how to draw them. Saving validates the question by running it, and
 * refuses a chart type that does not fit the result's shape. Drawing a view re-runs its stored query, so a view never
 * holds data and always reflects the current published definitions it pins.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AnalyticsQueryResultV1,
  type ChartViewV1,
  ChartViewV1Schema,
  compatibleChartTypes,
  CreateChartViewV1Schema,
  resultShape,
} from '@gigalibs/contracts';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { QueryEngineService } from './query-engine.service.js';

interface ChartViewRow {
  id: string;
  name: string;
  description: string | null;
  query_spec: unknown;
  visual_spec: unknown;
  created_by: string;
  created_at: string | Date;
}

@Injectable()
export class ChartViewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queryEngine: QueryEngineService,
  ) {}

  async create(principal: AnalyticsPrincipal, input: unknown): Promise<ChartViewV1> {
    const parsed = CreateChartViewV1Schema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BadRequestException(`Invalid chart view: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
    }
    const view = parsed.data;
    // Running the question validates every field and measure and gives the shape the chart type must fit.
    const result = await this.queryEngine.runSpec(principal, view.query);
    if (result.columns.length > 0) {
      const allowed = compatibleChartTypes(resultShape(result));
      if (!allowed.includes(view.visual.type)) {
        throw new BadRequestException(`Chart type '${view.visual.type}' does not fit this question; use one of: ${allowed.join(', ')}.`);
      }
    }
    // Pin formula measures to the versions the view was built with, so the chart stays stable until re-saved.
    const query = { ...view.query, measureVersions: { ...result.measureVersions, ...view.query.measureVersions } };

    const inserted = await this.db.queryWithTenant<ChartViewRow>(
      principal.tenantId,
      `INSERT INTO gigalibs_analytics.chart_views
         (tenant_id, semantic_model_id, name, description, query_spec, visual_spec, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING id, name, description, query_spec, visual_spec, created_by, created_at`,
      [
        principal.tenantId,
        query.semanticModelId,
        view.name,
        view.description,
        JSON.stringify(query),
        JSON.stringify(view.visual),
        principal.subject,
      ],
    );
    const row = inserted.rows[0]!;
    await this.db.queryWithTenant(
      principal.tenantId,
      `INSERT INTO gigalibs_analytics.analytics_audit_log
         (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
       VALUES ($1, 'CHART_VIEW_CREATED'::gigalibs_analytics.audit_event_type, $2, $3, 'CHART_VIEW', $4::jsonb)`,
      [principal.tenantId, principal.subject, row.id, JSON.stringify({ name: view.name, chartType: view.visual.type })],
    );
    return toView(row);
  }

  async list(principal: AnalyticsPrincipal): Promise<ChartViewV1[]> {
    const result = await this.db.queryWithTenant<ChartViewRow>(
      principal.tenantId,
      `SELECT id, name, description, query_spec, visual_spec, created_by, created_at
       FROM gigalibs_analytics.chart_views
       ORDER BY created_at DESC, id
       LIMIT 200`,
      [],
    );
    return result.rows.map(toView);
  }

  async get(principal: AnalyticsPrincipal, id: string): Promise<ChartViewV1> {
    const result = await this.db.queryWithTenant<ChartViewRow>(
      principal.tenantId,
      `SELECT id, name, description, query_spec, visual_spec, created_by, created_at
       FROM gigalibs_analytics.chart_views WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Chart view '${id}' not found.`);
    return toView(result.rows[0]!);
  }

  /** Draws a view: its definition plus a fresh result of its stored question. */
  async data(principal: AnalyticsPrincipal, id: string): Promise<{ view: ChartViewV1; result: AnalyticsQueryResultV1 }> {
    const view = await this.get(principal, id);
    return { view, result: await this.queryEngine.runSpec(principal, view.query) };
  }
}

function toView(row: ChartViewRow): ChartViewV1 {
  return ChartViewV1Schema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    query: typeof row.query_spec === 'string' ? JSON.parse(row.query_spec) : row.query_spec,
    visual: typeof row.visual_spec === 'string' ? JSON.parse(row.visual_spec) : row.visual_spec,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  });
}
