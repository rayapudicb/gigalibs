/**
 * WI-OI-103a — analytics query builder: shape, parameters, and refusals. User-supplied field names and values must
 * never appear in SQL text.
 */
import type { AnalyticsFieldType, AnalyticsQueryV1 } from '@gigalibs/contracts';
import { AnalyticsQueryV1Schema } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { AnalyticsQuerySpecError, buildAnalyticsQuery, type QueryMeasure } from './query-builder.js';

const fields = new Map<string, AnalyticsFieldType>([
  ['occurred_at', 'timestamp'],
  ['site', 'string'],
  ['priority', 'string'],
  ['hours', 'number'],
  ['closed', 'boolean'],
]);
const measures = new Map<string, QueryMeasure>([
  ['work_orders', { name: 'work_orders', aggregateFn: 'COUNT', fieldReference: 'site', label: 'Work orders' }],
  ['labour_hours', { name: 'labour_hours', aggregateFn: 'SUM', fieldReference: 'hours', label: 'Labour hours' }],
  ['sites', { name: 'sites', aggregateFn: 'COUNT_DISTINCT', fieldReference: 'site', label: 'Sites' }],
  [
    'hours_per_order',
    {
      name: 'hours_per_order',
      label: 'Hours per work order',
      formulaVersionId: '00000000-0000-4000-8000-000000000099',
      formulaExpression: {
        kind: 'binary',
        operator: 'divide',
        left: { kind: 'measure', name: 'labour_hours' },
        right: { kind: 'measure', name: 'work_orders' },
      },
    },
  ],
]);
const query = (input: Record<string, unknown>): AnalyticsQueryV1 =>
  AnalyticsQueryV1Schema.parse({ semanticModelId: '00000000-0000-4000-8000-000000000001', ...input });
const build = (input: Record<string, unknown>) =>
  buildAnalyticsQuery({ datasetVersionId: 'dsv-1', query: query(input), fields, measures });

describe('buildAnalyticsQuery', () => {
  it('groups measures by time grain and dimension, in select order', () => {
    const built = build({
      measures: ['work_orders', 'labour_hours'],
      dimensions: ['site'],
      time: { field: 'occurred_at', grain: 'month' },
      limit: 50,
    });
    expect(built.text).toContain("date_trunc('month',");
    expect(built.text).toContain('GROUP BY 1, 2');
    expect(built.text).toContain('ORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST');
    expect(built.text).toContain('COUNT(*) AS c2');
    expect(built.text).toMatch(/COALESCE\(SUM\(\(r\.analytical_payload->>\$\d+::text\)::numeric\), 0\) AS c3/);
    expect(built.params[0]).toBe('dsv-1');
    expect(built.params.at(-1)).toBe(51); // limit + 1 detects truncation
    expect(built.columns.map((c) => [c.name, c.role, c.type])).toEqual([
      ['occurred_at', 'time', 'timestamp'],
      ['site', 'dimension', 'string'],
      ['work_orders', 'measure', 'number'],
      ['labour_hours', 'measure', 'number'],
    ]);
  });

  it('never puts field names or filter values into SQL text', () => {
    const hostile = "x'); DROP TABLE gigalibs_analytics.dashboards; --";
    const built = build({
      measures: ['labour_hours'],
      dimensions: ['priority'],
      filters: [
        { field: 'site', op: 'eq', value: hostile },
        { field: 'hours', op: 'between', from: 1, to: 8 },
        { field: 'priority', op: 'in', values: ['HIGH', 'CRITICAL'] },
      ],
    });
    expect(built.text).not.toContain('DROP');
    for (const name of ['site', 'priority', 'hours', 'HIGH']) expect(built.text).not.toContain(name);
    expect(built.params).toContain(hostile);
    expect(built.params).toContainEqual(['HIGH', 'CRITICAL']);
    expect(built.text).toMatch(/::text = ANY\(\$\d+::text\[\]\)/);
    expect(built.text).toMatch(/::numeric BETWEEN \$\d+::numeric AND \$\d+::numeric/);
  });

  it('returns totals without GROUP BY when there are no dimensions or time', () => {
    const built = build({ measures: ['sites'] });
    expect(built.text).not.toContain('GROUP BY');
    expect(built.text).toContain('COUNT(DISTINCT r.analytical_payload->>$2::text) AS c0');
  });

  it('sorts by an output column', () => {
    const built = build({ measures: ['labour_hours'], dimensions: ['site'], sort: [{ by: 'labour_hours', direction: 'desc' }] });
    expect(built.text).toContain('ORDER BY 2 DESC NULLS LAST');
  });

  it('compiles a formula from allowlisted base measures and handles a zero denominator as null', () => {
    const built = build({ measures: ['hours_per_order'] });
    expect(built.text).toContain('NULLIF');
    expect(built.text).toContain('COUNT(*)');
    expect(built.text).toMatch(/COALESCE\(SUM\(\(r\.analytical_payload->>\$\d+::text\)::numeric\), 0\)/);
    expect(built.text).not.toContain('hours_per_order');
    expect(built.text).not.toContain('labour_hours');
    expect(built.params).toContain('hours');
  });

  it('binds formula constants and refuses formula-to-formula references', () => {
    const scaled = new Map(measures).set('scaled_hours', {
      name: 'scaled_hours',
      label: 'Scaled hours',
      formulaExpression: {
        kind: 'binary',
        operator: 'multiply',
        left: { kind: 'measure', name: 'labour_hours' },
        right: { kind: 'constant', value: 100 },
      },
    });
    const built = buildAnalyticsQuery({
      datasetVersionId: 'd',
      query: query({ measures: ['scaled_hours'] }),
      fields,
      measures: scaled,
    });
    expect(built.text).not.toContain('100');
    expect(built.params).toContain(100);

    const nested = new Map(measures).set('nested', {
      name: 'nested',
      label: 'Nested',
      formulaExpression: { kind: 'measure', name: 'hours_per_order' },
    });
    expect(() =>
      buildAnalyticsQuery({ datasetVersionId: 'd', query: query({ measures: ['nested'] }), fields, measures: nested }),
    ).toThrow("unknown base measure 'hours_per_order'");
  });

  it.each([
    [{ measures: ['labour_hours'], dimensions: ['unknown_field'] }, "unknown field 'unknown_field'"],
    [{ measures: ['labour_hours'], time: { field: 'site', grain: 'day' } }, 'not a date or timestamp'],
    [{ measures: ['labour_hours'], filters: [{ field: 'site', op: 'gte', value: 'A' }] }, 'needs a number, date or timestamp'],
    [{ measures: ['labour_hours'], filters: [{ field: 'hours', op: 'eq', value: 'eight' }] }, 'does not fit number'],
    [{ measures: ['labour_hours'], filters: [{ field: 'closed', op: 'eq', value: 'yes' }] }, 'does not fit boolean'],
    [{ measures: ['missing_measure'] }, "unknown measure 'missing_measure'"],
    [{ measures: ['labour_hours'], dimensions: ['site'], sort: [{ by: 'nowhere', direction: 'asc' }] }, 'is not an output column'],
    [
      { measures: ['labour_hours'], dimensions: ['occurred_at'], time: { field: 'occurred_at', grain: 'week' } },
      'also listed as a dimension',
    ],
  ])('refuses %j', (input, message) => {
    expect(() => build(input)).toThrow(AnalyticsQuerySpecError);
    expect(() => build(input)).toThrow(message);
  });

  it('refuses a measure named like a dimension and an unsupported aggregate', () => {
    const clash = new Map(measures).set('site', { name: 'site', aggregateFn: 'COUNT', fieldReference: 'site', label: 'Site' });
    expect(() =>
      buildAnalyticsQuery({ datasetVersionId: 'd', query: query({ measures: ['site'], dimensions: ['site'] }), fields, measures: clash }),
    ).toThrow('same name as a dimension');
    const odd = new Map(measures).set('median', { name: 'median', aggregateFn: 'MEDIAN', fieldReference: 'hours', label: 'Median' });
    expect(() =>
      buildAnalyticsQuery({ datasetVersionId: 'd', query: query({ measures: ['median'] }), fields, measures: odd }),
    ).toThrow("unsupported aggregate 'MEDIAN'");
  });
});

describe('AnalyticsQueryV1Schema', () => {
  it.each([
    [{ measures: [] }],
    [{ measures: ['a'], dimensions: ['a', 'b', 'c', 'd'] }],
    [{ measures: ['a'], dimensions: ['bad name'] }],
    [{ measures: ['a'], limit: 0 }],
    [{ measures: ['a'], limit: 10_001 }],
    [{ measures: ['a', 'a'] }],
    [{ measures: ['a'], extra: true }],
    [{ measures: ['a'], measureVersions: { b: '00000000-0000-4000-8000-000000000001' } }],
  ])('rejects %j', (input) => {
    expect(AnalyticsQueryV1Schema.safeParse({ semanticModelId: '00000000-0000-4000-8000-000000000001', ...input }).success).toBe(false);
  });
});
