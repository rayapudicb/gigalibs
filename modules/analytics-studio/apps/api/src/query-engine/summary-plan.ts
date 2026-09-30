/**
 * Summary planning (WI-OI-103c). Pure functions: which summary a question needs, whether a built summary can answer a
 * question exactly, and the SQL that builds a summary. The service owns storage and timing.
 */

import type { AnalyticsFieldType, AnalyticsQueryV1 } from '@gigalibs/contracts';
import type { QueryMeasure } from './query-builder.js';

export const MAX_SUMMARY_DIMENSIONS = 8;
export const MAX_SUMMARY_NUMERIC_FIELDS = 40;

/** Aggregates whose summary answer equals the raw answer (sum of sums, min of mins, …). */
const DECOMPOSABLE = new Set(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']);

export interface SummaryShape {
  readonly dimensions: readonly string[];
  readonly timeField: string | null;
}

export interface BuiltSummary extends SummaryShape {
  readonly id: string;
  readonly numericFields: readonly string[];
  readonly rowCount: number;
}

/**
 * The summary a saved question (plus any extra filter fields a dashboard offers) needs: its dimensions and non-date
 * filter fields as dimensions, and its time field, or else its one date filter field, bucketed by day.
 */
export function summaryShapeFor(
  query: Pick<AnalyticsQueryV1, 'dimensions' | 'filters' | 'time'>,
  fields: ReadonlyMap<string, AnalyticsFieldType>,
  extraFilterFields: readonly string[] = [],
): SummaryShape | null {
  const isDate = (name: string) => fields.get(name) === 'date' || fields.get(name) === 'timestamp';
  const dateFilterFields = [...new Set(query.filters.map((filter) => filter.field).filter(isDate))];
  const timeField = query.time?.field ?? (dateFilterFields.length === 1 ? dateFilterFields[0]! : null);
  const wanted = [...query.dimensions, ...query.filters.map((filter) => filter.field), ...extraFilterFields];
  const dimensions = [...new Set(wanted.filter((name) => name !== timeField && fields.has(name)))].sort();
  if (dimensions.length > MAX_SUMMARY_DIMENSIONS) return null;
  // A date filter on a field other than the time field would need that field as a dimension; a summary would then be
  // as large as the data, so such questions stay on the raw rows.
  if (dimensions.some(isDate)) return null;
  return { dimensions, timeField };
}

/** True when `summary` answers `query` exactly as the raw rows would. */
export function summaryCovers(
  summary: BuiltSummary,
  query: AnalyticsQueryV1,
  measures: ReadonlyMap<string, QueryMeasure>,
  fields: ReadonlyMap<string, AnalyticsFieldType>,
): boolean {
  const dims = new Set(summary.dimensions);
  const numbers = new Set(summary.numericFields);
  if (query.time && query.time.field !== summary.timeField) return false;
  if (!query.dimensions.every((name) => dims.has(name))) return false;
  for (const filter of query.filters) {
    if (dims.has(filter.field)) continue;
    // Days are exact for date fields; a timestamp filter could cut inside a day.
    if (filter.field === summary.timeField && fields.get(filter.field) === 'date') continue;
    return false;
  }
  const baseCovered = (measure: QueryMeasure | undefined): boolean =>
    !!measure &&
    !measure.formulaExpression &&
    DECOMPOSABLE.has(measure.aggregateFn ?? '') &&
    (measure.aggregateFn === 'COUNT' || numbers.has(measure.fieldReference ?? ''));
  const leaves = (expression: NonNullable<QueryMeasure['formulaExpression']>): string[] =>
    expression.kind === 'measure' ? [expression.name] : expression.kind === 'constant' ? [] : [...leaves(expression.left), ...leaves(expression.right)];
  return query.measures.every((name) => {
    const measure = measures.get(name);
    if (!measure) return false;
    if (!measure.formulaExpression) return baseCovered(measure);
    return leaves(measure.formulaExpression).every((leaf) => baseCovered(measures.get(leaf)));
  });
}

/** The covering summary with the fewest rows to read, if any. */
export function chooseSummary(
  candidates: readonly BuiltSummary[],
  query: AnalyticsQueryV1,
  measures: ReadonlyMap<string, QueryMeasure>,
  fields: ReadonlyMap<string, AnalyticsFieldType>,
): BuiltSummary | undefined {
  return candidates
    .filter((summary) => summaryCovers(summary, query, measures, fields))
    .sort((a, b) => a.rowCount - b.rowCount || a.dimensions.length - b.dimensions.length)[0];
}

/** Number fields a summary aggregates: every number field of the dataset, up to the cap, in name order. */
export function summaryNumericFields(fields: ReadonlyMap<string, AnalyticsFieldType>): string[] {
  return [...fields.entries()]
    .filter(([, type]) => type === 'number')
    .map(([name]) => name)
    .sort()
    .slice(0, MAX_SUMMARY_NUMERIC_FIELDS);
}

/**
 * INSERT … SELECT that fills a summary from the raw rows of its dataset version. Every field name is a bound
 * parameter; only fixed SQL surrounds them. `dims` and the aggregate arrays follow the order of `shape.dimensions`
 * and `numericFields`.
 */
export function buildSummaryInsert(input: {
  readonly summaryId: string;
  readonly tenantId: string;
  readonly datasetVersionId: string;
  readonly shape: SummaryShape;
  readonly numericFields: readonly string[];
}): { text: string; params: unknown[] } {
  const params: unknown[] = [input.summaryId, input.tenantId, input.datasetVersionId];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const inner: string[] = [];
  const groupBy: string[] = [];
  const dims = input.shape.dimensions.map((name, index) => {
    inner.push(`r.analytical_payload->>${bind(name)}::text AS d${index}`);
    groupBy.push(`d${index}`);
    return `d${index}`;
  });
  if (input.shape.timeField) {
    inner.push(`date_trunc('day', (r.analytical_payload->>${bind(input.shape.timeField)}::text)::timestamptz)::date AS day`);
    groupBy.push('day');
  }
  const numbers = input.numericFields.map((name, index) => {
    inner.push(`(r.analytical_payload->>${bind(name)}::text)::numeric AS m${index}`);
    return `m${index}`;
  });
  const array = (items: string[], type: string) => `ARRAY[${items.join(', ')}]::${type}[]`;
  const text = [
    'INSERT INTO gigalibs_analytics.analytics_summary_rows (summary_id, tenant_id, dims, day, row_count, sums, counts, mins, maxs)',
    `SELECT $1, $2, ${array(dims, 'text')}, ${input.shape.timeField ? 'day' : 'NULL::date'}, COUNT(*), ` +
      [
        array(numbers.map((m) => `SUM(${m})`), 'numeric'),
        array(numbers.map((m) => `COUNT(${m})`), 'bigint'),
        array(numbers.map((m) => `MIN(${m})`), 'numeric'),
        array(numbers.map((m) => `MAX(${m})`), 'numeric'),
      ].join(', '),
    `FROM (SELECT ${inner.length ? inner.join(', ') : '1 AS one'} FROM gigalibs_analytics.dataset_record_versions r WHERE r.dataset_version_id = $3) x`,
    groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { text, params };
}
