/**
 * WI-OI-103a — QueryEngineService.runSpec with a mocked database: validation, model lookup, field whitelisting from
 * the published mapping, typed rows and truncation.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { QueryEngineService } from './query-engine.service.js';

const MODEL = '00000000-0000-4000-8000-000000000001';
const principal = { tenantId: 'tenant-a', spatialScope: { mode: 'UNBOUNDED' } } as AnalyticsPrincipal;
const scoped = (placeIds: string[]) => ({ tenantId: 'tenant-a', spatialScope: { mode: 'SCOPED_PLACES', place_ids: placeIds } }) as never;

function service(options: { model?: boolean; resultRows?: Array<Record<string, unknown>>; placed?: boolean } = {}) {
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
              ...(options.placed ? [{ sourceField: 'farm_code', analyticalField: 'farm', analyticalType: 'string', place: { byCode: true } }] : []),
            ],
          },
        ],
      };
    }
    if (sql.includes('FROM gigalibs_analytics.formula_measures fm')) return { rows: [] };
    if (sql.includes('FROM gigalibs_analytics.place_directory d')) {
      const assigned = params[0] as string[];
      const directory = [
        { place_id: 'p1', path: 'estate.north', parent: null },
        { place_id: 'p1-field', path: 'estate.north.f1', parent: 'p1' },
        { place_id: 'p2', path: 'estate.south', parent: null },
      ];
      return {
        rows: directory
          .filter((place) => assigned.includes(place.place_id) || (place.parent !== null && assigned.includes(place.parent)))
          .map((place) => ({ place_id: place.place_id, path: place.path, assigned: assigned.includes(place.place_id) })),
      };
    }
    if (sql.includes('FROM gigalibs_analytics.dataset_record_versions r')) return { rows: options.resultRows ?? [] };
    if (sql.includes('FROM gigalibs_analytics.analytics_summary_rows s')) return { rows: options.resultRows ?? [] };
    throw new Error(`unexpected SQL: ${sql}`);
  });
  // Questions run in a transaction with a statement time limit (WI-OI-103c); route its client through the same mock,
  // looked up at call time so a test can swap queryWithTenant.
  const db: Record<string, unknown> = { queryWithTenant };
  db.withTenantTransaction = vi.fn(async (tenant: string, callback: (client: unknown) => unknown) =>
    callback({
      query: (sql: string, params: unknown[] = []) =>
        sql.startsWith('SELECT set_config')
          ? (calls.push({ sql, params }), Promise.resolve({ rows: [] }))
          : (db.queryWithTenant as typeof queryWithTenant)(tenant, sql, params),
    }),
  );
  return { engine: new QueryEngineService(db as never), calls };
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

  it('resolves and returns the exact published formula version used by the query', async () => {
    const versionId = '00000000-0000-4000-8000-000000000099';
    const { engine, calls } = service({ resultRows: [{ c0: '2.5' }] });
    const original = (engine as any).db.queryWithTenant;
    (engine as any).db.queryWithTenant = vi.fn(async (tenant: string, sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM gigalibs_analytics.formula_measures fm')) {
        return {
          rows: [
            {
              measure_name: 'hours_per_order',
              current_published_version_id: versionId,
              version_id: versionId,
              definition: {
                displayLabel: 'Hours per order',
                description: null,
                unit: 'hours/order',
                expression: {
                  kind: 'binary',
                  operator: 'divide',
                  left: { kind: 'measure', name: 'labour_hours' },
                  right: { kind: 'measure', name: 'work_orders' },
                },
              },
            },
          ],
        };
      }
      return original(tenant, sql, params);
    });
    const result = await engine.runSpec(principal, {
      semanticModelId: MODEL,
      measures: ['hours_per_order'],
      measureVersions: { hours_per_order: versionId },
    });
    expect(result.measureVersions).toEqual({ hours_per_order: versionId });
    expect(result.columns[0]?.label).toBe('Hours per order');
    expect(result.rows).toEqual([[2.5]]);
    expect(calls.some((call) => call.sql.includes('NULLIF'))).toBe(true);
  });

  // WI-OI-103c: limits and the answer cache.
  it('runs each question under the statement time limit', async () => {
    const { engine, calls } = service({ resultRows: [{ c0: '3' }] });
    await engine.runSpec(principal, { semanticModelId: MODEL, measures: ['work_orders'] });
    expect(calls.some((call) => call.sql.startsWith('SELECT set_config') && call.params[0] === 'statement_timeout' && call.params[1] === '15000')).toBe(true);
  });

  it('turns a statement timeout into advice instead of an error page', async () => {
    const { engine } = service();
    (engine as any).db.queryWithTenant = vi.fn(async () => {
      throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    });
    (engine as any).db.withTenantTransaction = vi.fn(async () => {
      throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    });
    const fresh = service({ resultRows: [] });
    (fresh.engine as any).db.withTenantTransaction = (engine as any).db.withTenantTransaction;
    await expect(fresh.engine.runSpec(principal, { semanticModelId: MODEL, measures: ['work_orders'] })).rejects.toThrow(/longer than 15 seconds/);
  });

  it('answers a repeated question from the cache, but not across tenants or place scopes', async () => {
    const { engine, calls } = service({ resultRows: [{ c0: '3' }] });
    const scans = () => calls.filter((call) => call.sql.includes('FROM gigalibs_analytics.dataset_record_versions r')).length;
    const question = { semanticModelId: MODEL, measures: ['work_orders'], dimensions: ['site'] };
    const first = await engine.runSpec(principal, question);
    const again = await engine.runSpec(principal, { dimensions: ['site'], measures: ['work_orders'], semanticModelId: MODEL });
    expect(scans()).toBe(1);
    expect(again.rows).toEqual(first.rows);
    expect(again.freshness).toBe(first.freshness);
    await engine.runSpec({ tenantId: 'tenant-b', spatialScope: { mode: 'UNBOUNDED' } } as AnalyticsPrincipal, question);
    expect(scans()).toBe(2);
    const placed = service({ resultRows: [{ c0: '3' }], placed: true });
    const placedScans = () => placed.calls.filter((call) => call.sql.includes('FROM gigalibs_analytics.dataset_record_versions r')).length;
    await placed.engine.runSpec(principal, question);
    await placed.engine.runSpec(scoped(['p1']), question);
    await placed.engine.runSpec(scoped(['p2']), question);
    await placed.engine.runSpec(scoped(['p1']), question);
    expect(placedScans()).toBe(3);
  });

  // WI-OI-105d (ADR-0016 F15, D2 and D3).
  describe('a member with a place scope', () => {
    it('sees only records tagged with their places or places inside them, answered from the rows', async () => {
      const { engine, calls } = service({ resultRows: [{ c0: 'North', c1: '7' }], placed: true });
      const summaries = { ready: vi.fn(async () => [{ id: 'sum-1', dimensions: ['site'], timeField: 'occurred_at', numericFields: ['hours'], rowCount: 12 }]) };
      const routed = new QueryEngineService((engine as any).db, summaries as never);
      const answer = await routed.runSpec(scoped(['p1']), { semanticModelId: MODEL, measures: ['labour_hours'], dimensions: ['site'] });
      expect(answer.answeredFrom).toBe('rows');
      expect(summaries.ready).not.toHaveBeenCalled();
      const scan = calls.at(-1)!;
      expect(scan.sql).toContain("(r.analytical_payload->>'place_id') = ANY(");
      expect(scan.params).toContainEqual(['p1', 'p1-field']);
    });

    it('sees nothing when none of their places is known yet, and is refused a dataset without places', async () => {
      const placed = service({ placed: true });
      await placed.engine.runSpec(scoped(['unknown']), { semanticModelId: MODEL, measures: ['work_orders'] });
      expect(placed.calls.at(-1)!.params).toContainEqual([]);
      const unplaced = service();
      await expect(unplaced.engine.runSpec(scoped(['p1']), { semanticModelId: MODEL, measures: ['work_orders'] })).rejects.toMatchObject({
        response: { code: 'SPATIAL_SCOPE_DENIED' },
      });
      await expect(unplaced.engine.runSpec(scoped([]), { semanticModelId: MODEL, measures: ['work_orders'] })).rejects.toMatchObject({
        response: { code: 'SPATIAL_SCOPE_DENIED' },
      });
    });
  });

  it('answers from a READY summary that covers the question, and from the raw rows otherwise', async () => {
    const { engine, calls } = service({ resultRows: [{ c0: 'North', c1: '7' }] });
    const summaries = {
      ready: vi.fn(async () => [{ id: 'sum-1', dimensions: ['site'], timeField: 'occurred_at', numericFields: ['hours'], rowCount: 12 }]),
    };
    const routed = new QueryEngineService((engine as any).db, summaries as never);
    const covered = await routed.runSpec(principal, { semanticModelId: MODEL, measures: ['labour_hours'], dimensions: ['site'] });
    expect(covered.answeredFrom).toBe('summary');
    expect(calls.at(-1)!.sql).toContain('FROM gigalibs_analytics.analytics_summary_rows s');
    expect(calls.at(-1)!.params[0]).toBe('sum-1');

    const notCovered = await routed.runSpec(principal, {
      semanticModelId: MODEL,
      measures: ['labour_hours'],
      filters: [{ field: 'hours', op: 'gte', value: 2 }],
    });
    expect(notCovered.answeredFrom).toBe('rows');
    expect(calls.at(-1)!.sql).toContain('FROM gigalibs_analytics.dataset_record_versions r');
  });
});
