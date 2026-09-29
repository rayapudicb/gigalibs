/**
 * WI-OI-103d — chart views: saving validates the question by running it, refuses a chart type that does not fit,
 * pins formula versions, audits the creation; drawing re-runs the stored question.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { ChartViewService } from './chart-view.service.js';

const MODEL = '00000000-0000-4000-8000-000000000001';
const VIEW = '00000000-0000-4000-8000-0000000000b1';
const FORMULA_VERSION = '00000000-0000-4000-8000-0000000000f1';
const principal = { tenantId: 'tenant-a', subject: 'user-1' } as AnalyticsPrincipal;
const byCropResult = {
  semanticModelId: MODEL,
  datasetVersionId: 'dsv',
  definitionVersion: 1,
  measureVersions: { yield_per_ha: FORMULA_VERSION },
  asOf: '2026-09-29T00:00:00Z',
  freshness: 'FRESH' as const,
  watermark: null,
  columns: [
    { name: 'crop', label: 'crop', role: 'dimension' as const, type: 'string' as const },
    { name: 'yield_per_ha', label: 'Yield', role: 'measure' as const, type: 'number' as const },
  ],
  rows: [['Maize', 4.1]],
  truncated: false,
};
const body = (type: string) => ({
  name: 'Yield by crop',
  query: { semanticModelId: MODEL, measures: ['yield_per_ha'], dimensions: ['crop'] },
  visual: { type },
});

function service(options: { found?: boolean } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queryWithTenant = vi.fn(async (_tenant: string, sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO gigalibs_analytics.chart_views')) {
      return {
        rows: [
          { id: VIEW, name: params[2], description: params[3], query_spec: params[4], visual_spec: params[5], created_by: params[6], created_at: '2026-09-29T00:00:00Z' },
        ],
      };
    }
    if (sql.includes('analytics_audit_log')) return { rows: [] };
    if (sql.includes('FROM gigalibs_analytics.chart_views')) {
      if (options.found === false) return { rows: [] };
      return {
        rows: [
          { id: VIEW, name: 'Yield by crop', description: null, query_spec: body('column').query, visual_spec: { type: 'column' }, created_by: 'user-1', created_at: '2026-09-29T00:00:00Z' },
        ],
      };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const runSpec = vi.fn(async () => byCropResult);
  return { views: new ChartViewService({ queryWithTenant } as never, { runSpec } as never), calls, runSpec };
}

describe('ChartViewService', () => {
  it('saves a question and chart type, pins formula versions, and audits it', async () => {
    const { views, calls } = service();
    const saved = await views.create(principal, body('donut'));
    expect(saved.visual.type).toBe('donut');
    expect(saved.query.measureVersions).toEqual({ yield_per_ha: FORMULA_VERSION });
    const insert = calls.find((call) => call.sql.includes('INSERT INTO gigalibs_analytics.chart_views'))!;
    expect(JSON.parse(insert.params[4] as string)).not.toHaveProperty('rows'); // the question, never data
    expect(calls.some((call) => call.sql.includes("'CHART_VIEW_CREATED'"))).toBe(true);
  });

  it('refuses a chart type that does not fit the question', async () => {
    await expect(service().views.create(principal, body('sankey'))).rejects.toThrow(BadRequestException);
    await expect(service().views.create(principal, body('sankey'))).rejects.toThrow('does not fit');
  });

  it('refuses an invalid body before running anything', async () => {
    const { views, runSpec } = service();
    await expect(views.create(principal, { name: '', query: {}, visual: { type: 'line' } })).rejects.toThrow(BadRequestException);
    expect(runSpec).not.toHaveBeenCalled();
  });

  it('draws a view by re-running its stored question, and 404s an unknown view', async () => {
    const { views, runSpec } = service();
    const drawn = await views.data(principal, VIEW);
    expect(drawn.result.rows).toEqual([['Maize', 4.1]]);
    expect(runSpec).toHaveBeenCalledWith(principal, expect.objectContaining({ semanticModelId: MODEL }));
    await expect(service({ found: false }).views.get(principal, VIEW)).rejects.toThrow(NotFoundException);
  });
});
