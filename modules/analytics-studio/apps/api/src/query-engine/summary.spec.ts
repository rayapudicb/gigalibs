import { describe, expect, it, vi } from 'vitest';
import { AnalyticsQueryV1Schema, type AnalyticsFieldType } from '@gigalibs/contracts';
import type { DatabaseService } from '../database/database.service.js';
import { buildAnalyticsQuery, type QueryMeasure } from './query-builder.js';
import { buildSummaryInsert, chooseSummary, summaryCovers, summaryNumericFields, summaryShapeFor, type BuiltSummary } from './summary-plan.js';
import { SummaryService } from './summary.service.js';

const MODEL = '00000000-0000-4000-8000-000000000001';
const fields = new Map<string, AnalyticsFieldType>([
  ['farm', 'string'],
  ['crop', 'string'],
  ['harvest_date', 'date'],
  ['logged_at', 'timestamp'],
  ['yield_kg', 'number'],
  ['area_ha', 'number'],
  ['record_id', 'string'],
]);
const measures = new Map<string, QueryMeasure>([
  ['yield', { name: 'yield', aggregateFn: 'SUM', fieldReference: 'yield_kg', label: 'Yield' }],
  ['area', { name: 'area', aggregateFn: 'SUM', fieldReference: 'area_ha', label: 'Area' }],
  ['avg_yield', { name: 'avg_yield', aggregateFn: 'AVG', fieldReference: 'yield_kg', label: 'Avg' }],
  ['logs', { name: 'logs', aggregateFn: 'COUNT', fieldReference: 'record_id', label: 'Logs' }],
  ['farms', { name: 'farms', aggregateFn: 'COUNT_DISTINCT', fieldReference: 'farm', label: 'Farms' }],
  [
    'per_ha',
    {
      name: 'per_ha',
      label: 'Yield per ha',
      formulaExpression: { kind: 'binary', operator: 'divide', left: { kind: 'measure', name: 'yield' }, right: { kind: 'measure', name: 'area' } },
      formulaVersionId: 'v1',
    },
  ],
]);
const q = (input: Record<string, unknown>) => AnalyticsQueryV1Schema.parse({ semanticModelId: MODEL, measures: ['yield'], ...input });
const summary = (dimensions: string[], timeField: string | null = 'harvest_date', rowCount = 100): BuiltSummary => ({
  id: `s-${dimensions.join('-')}-${timeField}`,
  dimensions,
  timeField,
  numericFields: ['area_ha', 'yield_kg'],
  rowCount,
});

// WI-OI-103c: summaries answer dashboard questions exactly as the raw rows would.
describe('summary planning', () => {
  it('asks for the question dimensions and filter fields, bucketing its time field (or one date filter) by day', () => {
    expect(summaryShapeFor(q({ dimensions: ['crop'], time: { field: 'harvest_date', grain: 'month' }, filters: [{ field: 'farm', op: 'eq', value: 'A' }] }), fields)).toEqual({
      dimensions: ['crop', 'farm'],
      timeField: 'harvest_date',
    });
    expect(summaryShapeFor(q({ filters: [{ field: 'harvest_date', op: 'gte', value: '2025-01-01' }] }), fields, ['farm', 'unknown'])).toEqual({
      dimensions: ['farm'],
      timeField: 'harvest_date',
    });
    // A second date field would have to be a dimension: that summary would be as large as the data.
    expect(summaryShapeFor(q({ time: { field: 'harvest_date', grain: 'day' }, filters: [{ field: 'logged_at', op: 'gte', value: '2025-01-01' }] }), fields)).toBeNull();
  });

  it('uses a summary only when it answers exactly', () => {
    const byFarmCrop = summary(['crop', 'farm']);
    expect(summaryCovers(byFarmCrop, q({ dimensions: ['farm'], measures: ['yield', 'avg_yield', 'logs', 'per_ha'], time: { field: 'harvest_date', grain: 'quarter' } }), measures, fields)).toBe(true);
    expect(summaryCovers(byFarmCrop, q({ filters: [{ field: 'harvest_date', op: 'between', from: '2025-01-01', to: '2025-06-30' }] }), measures, fields)).toBe(true);
    for (const miss of [
      q({ dimensions: ['record_id'] }), // dimension not held
      q({ filters: [{ field: 'yield_kg', op: 'gte', value: 10 }] }), // filter on a number that is not a dimension
      q({ measures: ['farms'] }), // COUNT DISTINCT cannot be summed
      q({ time: { field: 'logged_at', grain: 'day' } }), // another time field
    ]) {
      expect(summaryCovers(byFarmCrop, miss, measures, fields)).toBe(false);
    }
    const byTimestamp = summary([], 'logged_at');
    expect(summaryCovers(byTimestamp, q({ time: { field: 'logged_at', grain: 'month' } }), measures, fields)).toBe(true);
    // A timestamp filter could cut inside a day.
    expect(summaryCovers(byTimestamp, q({ filters: [{ field: 'logged_at', op: 'gte', value: '2025-01-01T12:00:00Z' }] }), measures, fields)).toBe(false);
  });

  it('picks the covering summary with the fewest rows', () => {
    const chosen = chooseSummary(
      [summary(['crop', 'farm'], 'harvest_date', 90_000), summary(['crop', 'farm'], null, 800), summary(['crop'], null, 8)],
      q({ dimensions: ['farm'] }),
      measures,
      fields,
    );
    expect([chosen?.dimensions, chosen?.timeField, chosen?.rowCount]).toEqual([['crop', 'farm'], null, 800]);
    expect(chooseSummary([summary(['crop'])], q({ dimensions: ['farm'] }), measures, fields)).toBeUndefined();
  });

  it('builds a summary with bound field names, day buckets and sum, count, min and max per number field', () => {
    expect(summaryNumericFields(fields)).toEqual(['area_ha', 'yield_kg']);
    const built = buildSummaryInsert({
      summaryId: 's1',
      tenantId: 't1',
      datasetVersionId: 'dv1',
      shape: { dimensions: ['farm'], timeField: 'harvest_date' },
      numericFields: ['yield_kg'],
    });
    expect(built.params).toEqual(['s1', 't1', 'dv1', 'farm', 'harvest_date', 'yield_kg']);
    expect(built.text).toContain("date_trunc('day'");
    expect(built.text).toContain('SELECT $1, $2, ARRAY[d0]::text[], day, COUNT(*), ARRAY[SUM(m0)]::numeric[], ARRAY[COUNT(m0)]::bigint[], ARRAY[MIN(m0)]::numeric[], ARRAY[MAX(m0)]::numeric[]');
    expect(built.text).toContain('GROUP BY d0, day');
    expect(built.text).not.toMatch(/farm|harvest_date|yield_kg/);
  });
});

describe('query builder over a summary', () => {
  it('reads summary rows with summed parts, and filters days and dimensions', () => {
    const built = buildAnalyticsQuery({
      datasetVersionId: 'dv1',
      query: q({
        measures: ['yield', 'avg_yield', 'logs', 'per_ha'],
        dimensions: ['farm'],
        time: { field: 'harvest_date', grain: 'month' },
        filters: [
          { field: 'crop', op: 'in', values: ['Rice'] },
          { field: 'harvest_date', op: 'between', from: '2025-01-01', to: '2025-12-31' },
        ],
      }),
      fields,
      measures,
      summary: { id: 'sum-1', dimensions: ['crop', 'farm'], timeField: 'harvest_date', numericFields: ['area_ha', 'yield_kg'] },
    });
    expect(built.params[0]).toBe('sum-1');
    expect(built.text).toContain('FROM gigalibs_analytics.analytics_summary_rows s');
    expect(built.text).toContain('WHERE s.summary_id = $1');
    expect(built.text).toContain("date_trunc('month', (s.day::text)::timestamptz)");
    expect(built.text).toContain('(s.dims[2]) AS c1');
    expect(built.text).toContain('(s.dims[1])::text = ANY(');
    expect(built.text).toContain('COALESCE(SUM(s.sums[2]), 0)');
    expect(built.text).toContain('(SUM(s.sums[2]) / NULLIF(SUM(s.counts[2]), 0))');
    expect(built.text).toContain('COALESCE(SUM(s.row_count), 0)');
    expect(built.text).toContain('((COALESCE(SUM(s.sums[2]), 0)) / NULLIF((COALESCE(SUM(s.sums[1]), 0)), 0))');
    expect(built.text).toContain('(s.day::text)::date BETWEEN');
    expect(built.text).not.toContain('dataset_record_versions');
  });
});

describe('SummaryService', () => {
  function harness(existing: Array<Record<string, unknown>> = []) {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.startsWith('INSERT INTO gigalibs_analytics.analytics_summary_rows')) return { rowCount: 42, rows: [] };
        return { rowCount: 0, rows: [] };
      }),
    };
    const db = {
      queryWithTenant: vi.fn(async (_t: string, sql: string) => {
        statements.push(sql);
        if (sql.includes('SELECT id, status, requested_at')) return { rows: existing };
        if (sql.includes('INSERT INTO gigalibs_analytics.analytics_summaries')) return { rows: [{ id: 'new-1' }] };
        return { rows: [] };
      }),
      withTenantTransaction: vi.fn(async (_t: string, callback: (value: unknown) => unknown) => callback(client)),
    };
    return { service: new SummaryService(db as unknown as DatabaseService), db, statements };
  }
  const shape = { dimensions: ['farm'], timeField: 'harvest_date' };

  it('records a new summary and builds it under a time limit, then marks it READY', async () => {
    const { service, statements } = harness();
    await service.ensure('t1', 'dv1', shape, fields, { wait: true });
    expect(statements.some((sql) => sql.includes("'BUILDING'") && sql.includes('INSERT INTO gigalibs_analytics.analytics_summaries'))).toBe(true);
    expect(statements.some((sql) => sql.startsWith('SELECT set_config'))).toBe(true);
    expect(statements.findIndex((sql) => sql.startsWith('DELETE FROM gigalibs_analytics.analytics_summary_rows'))).toBeLessThan(
      statements.findIndex((sql) => sql.startsWith('INSERT INTO gigalibs_analytics.analytics_summary_rows')),
    );
    expect(statements.some((sql) => sql.includes("SET status = 'READY'"))).toBe(true);
  });

  it('rebuilds a failed or stuck summary and leaves a ready or recent one alone', async () => {
    for (const row of [
      { id: 's', status: 'FAILED', requested_at: new Date() },
      { id: 's', status: 'BUILDING', requested_at: new Date(Date.now() - 11 * 60 * 1000) },
    ]) {
      const { service, statements } = harness([row]);
      await service.ensure('t1', 'dv1', shape, fields, { wait: true });
      expect(statements.some((sql) => sql.includes("SET status = 'BUILDING'"))).toBe(true);
    }
    for (const row of [{ id: 's', status: 'READY', requested_at: new Date() }, { id: 's', status: 'BUILDING', requested_at: new Date() }]) {
      const { service, db } = harness([row]);
      await service.ensure('t1', 'dv1', shape, fields, { wait: true });
      expect(db.withTenantTransaction).not.toHaveBeenCalled();
    }
  });

  it('marks a summary FAILED when its build fails and never throws to the caller', async () => {
    const { service, db, statements } = harness();
    db.withTenantTransaction.mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
    await expect(service.ensure('t1', 'dv1', shape, fields, { wait: true })).resolves.toBe('new-1');
    expect(statements.some((sql) => sql.includes("SET status = 'FAILED'"))).toBe(true);
  });
});
