/**
 * WI-OI-103a — QueryEngineService.runSpec with a mocked database: validation, model lookup, field whitelisting from
 * the published mapping, typed rows and truncation.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { QueryEngineService } from './query-engine.service.js';

const MODEL = '00000000-0000-4000-8000-000000000001';
const principal = { tenantId: 'tenant-a' } as AnalyticsPrincipal;

function service(options: { model?: boolean; resultRows?: Array<Record<string, unknown>> } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queryWithTenant = vi.fn(async (_tenant: string, sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM gigalibs_analytics.semantic_models sm')) {
      return {
        rows:
          options.model === false
            ? []
            : [
                { dataset_version_id: 'dsv-1', version_number: 3, measure_name: 'work_orders', aggregate_fn: 'COUNT', field_reference: 'site', display_label: 'Work orders' },
                { dataset_version_id: 'dsv-1', version_number: 3, measure_name: 'labour_hours', aggregate_fn: 'SUM', field_reference: 'hours', display_label: 'Labour hours' },
              ],
      };
    }
    if (sql.includes("build_status = 'BUILDING'")) return { rows: [{ count: '0' }] };
    if (sql.includes('SELECT build_status, completed_at, record_count')) {
      return { rows: [{ build_status: 'READY', completed_at: new Date().toISOString(), record_count: 42 }] };
    }
    if (sql.includes('source_sync_runs')) return { rows: [{ watermark_value: 'wm-9' }] };
    if (sql.includes('studio_mapping_versions')) {
      return {
        rows: [
          {
            field_mappings: [
              { sourceField: 'created_at', analyticalField: 'occurred_at', analyticalType: 'timestamp' },
              { sourceField: 'site_name', analyticalField: 'site', analyticalType: 'string' },
              { sourceField: 'labour', analyticalField: 'hours', analyticalType: 'number' },
            ],
          },
        ],
      };
    }
    if (sql.includes('FROM gigalibs_analytics.dataset_record_versions r')) return { rows: options.resultRows ?? [] };
    throw new Error(`unexpected SQL: ${sql}`);
  });
  return { engine: new QueryEngineService({ queryWithTenant } as never), calls };
}

describe('QueryEngineService.runSpec', () => {
  it('returns typed rows for measures by month and site, with freshness', async () => {
    const { engine, calls } = service({
      resultRows: [
        { c0: new Date('2026-08-01T00:00:00Z'), c1: 'Plant A', c2: '7', c3: '12.50' },
        { c0: new Date('2026-09-01T00:00:00Z'), c1: 'Plant A', c2: '3', c3: '4' },
      ],
    });
    const result = await engine.runSpec(principal, {
      semanticModelId: MODEL,
      measures: ['work_orders', 'labour_hours'],
      dimensions: ['site'],
      time: { field: 'occurred_at', grain: 'month' },
    });
    expect(result.freshness).toBe('FRESH');
    expect(result.watermark).toBe('wm-9');
    expect(result.definitionVersion).toBe(3);
    expect(result.columns.map((c) => c.name)).toEqual(['occurred_at', 'site', 'work_orders', 'labour_hours']);
    expect(result.rows).toEqual([
      ['2026-08-01T00:00:00.000Z', 'Plant A', 7, 12.5],
      ['2026-09-01T00:00:00.000Z', 'Plant A', 3, 4],
    ]);
    expect(result.truncated).toBe(false);
    const finalQuery = calls.at(-1)!;
    expect(finalQuery.sql).toContain('GROUP BY 1, 2');
    expect(finalQuery.params).toContain('occurred_at');
  });

  it('reports truncation when more rows match than the limit', async () => {
    const { engine } = service({ resultRows: [{ c0: 'A', c1: '1' }, { c0: 'B', c1: '2' }, { c0: 'C', c1: '3' }] });
    const result = await engine.runSpec(principal, { semanticModelId: MODEL, measures: ['work_orders'], dimensions: ['site'], limit: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('refuses a field the published mapping does not declare', async () => {
    const { engine } = service();
    await expect(
      engine.runSpec(principal, { semanticModelId: MODEL, measures: ['work_orders'], dimensions: ['cost_centre'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an invalid body and an unknown model', async () => {
    await expect(service().engine.runSpec(principal, { semanticModelId: MODEL, measures: [] })).rejects.toThrow(BadRequestException);
    await expect(service({ model: false }).engine.runSpec(principal, { semanticModelId: MODEL, measures: ['work_orders'] })).rejects.toThrow(
      NotFoundException,
    );
  });
});
