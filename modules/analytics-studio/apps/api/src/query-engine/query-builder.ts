/**
 * Analytics query builder (WI-OI-103a, ADR-0016 F13).
 *
 * Turns an AnalyticsQueryV1 ("measures by dimensions, per time grain, filtered and sorted") into one parameterised SQL
 * statement over gigalibs_analytics.dataset_record_versions. Safety rules:
 * - every field name and every filter value is a bound parameter; field names are whitelisted against the published
 *   mapping before they get here;
 * - only the time grain, the aggregate expressions and the type casts are SQL text, and all three come from closed
 *   switches;
 * - GROUP BY and ORDER BY use select-list positions, so user text never appears in them.
 */

import type {
  AnalyticsFieldType,
  AnalyticsFilterV1,
  AnalyticsQueryColumnV1,
  AnalyticsQueryV1,
  AnalyticsTimeGrain,
  FormulaExpressionV1,
} from '@gigalibs/contracts';

export interface QueryMeasure {
  readonly name: string;
  readonly aggregateFn?: string;
  readonly fieldReference?: string;
  readonly label: string;
  /** Present only for a published formula version. Formula leaves may reference base measures only. */
  readonly formulaExpression?: FormulaExpressionV1;
  readonly formulaVersionId?: string;
}

export interface BuiltAnalyticsQuery {
  readonly text: string;
  readonly params: readonly unknown[];
  /** Output columns in select order; SQL aliases are c0, c1, … in the same order. */
  readonly columns: readonly AnalyticsQueryColumnV1[];
}

/** A query that is well-formed but does not fit this model (unknown field, wrong type, bad operator). */
export class AnalyticsQuerySpecError extends Error {}

const GRAIN_SQL: Readonly<Record<AnalyticsTimeGrain, string>> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

const CAST: Readonly<Record<AnalyticsFieldType, string>> = {
  string: '::text',
  number: '::numeric',
  boolean: '::boolean',
  date: '::date',
  timestamp: '::timestamptz',
};

const ORDERED_TYPES: ReadonlySet<AnalyticsFieldType> = new Set(['number', 'date', 'timestamp']);

/**
 * A READY summary chosen by `summaryCovers` (WI-OI-103c); the question is then answered from its rows. `dimensions`
 * and `numericFields` give the positions of the summary's typed arrays.
 */
export interface QuerySummarySource {
  readonly id: string;
  readonly dimensions: readonly string[];
  readonly timeField: string | null;
  readonly numericFields: readonly string[];
}

export function buildAnalyticsQuery(input: {
  readonly datasetVersionId: string;
  readonly query: AnalyticsQueryV1;
  readonly fields: ReadonlyMap<string, AnalyticsFieldType>;
  readonly measures: ReadonlyMap<string, QueryMeasure>;
  readonly summary?: QuerySummarySource;
}): BuiltAnalyticsQuery {
  const { query, fields, measures, summary } = input;
  const params: unknown[] = [summary ? summary.id : input.datasetVersionId];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const fieldType = (name: string, where: string): AnalyticsFieldType => {
    const type = fields.get(name);
    if (!type) throw new AnalyticsQuerySpecError(`${where}: unknown field '${name}'.`);
    return type;
  };
  const fieldText = (name: string): string => {
    if (!summary) return `(r.analytical_payload->>${bind(name)}::text)`;
    if (name === summary.timeField) return '(s.day::text)';
    // Array positions come from the summary's own field list, never from the caller's text.
    const position = summary.dimensions.indexOf(name);
    if (position >= 0) return `(s.dims[${position + 1}])`;
    throw new AnalyticsQuerySpecError(`summary: field '${name}' is not held by the chosen summary.`);
  };
  const agg = (measure: QueryMeasure): string => (summary ? summaryAggregate(measure, summary.numericFields) : aggregate(measure, bind));

  const select: string[] = [];
  const columns: AnalyticsQueryColumnV1[] = [];

  if (query.time) {
    const type = fieldType(query.time.field, 'time');
    if (type !== 'date' && type !== 'timestamp')
      throw new AnalyticsQuerySpecError(`time: field '${query.time.field}' is ${type}, not a date or timestamp.`);
    if (query.dimensions.includes(query.time.field))
      throw new AnalyticsQuerySpecError(`time: field '${query.time.field}' is also listed as a dimension.`);
    select.push(`date_trunc('${GRAIN_SQL[query.time.grain]}', ${fieldText(query.time.field)}::timestamptz)`);
    columns.push({ name: query.time.field, label: `${query.time.field} (${query.time.grain})`, role: 'time', type: 'timestamp' });
  }
  for (const dimension of query.dimensions) {
    const type = fieldType(dimension, 'dimensions');
    select.push(fieldText(dimension));
    columns.push({ name: dimension, label: dimension, role: 'dimension', type });
  }
  const groupCount = select.length;

  for (const name of query.measures) {
    const measure = measures.get(name);
    if (!measure) throw new AnalyticsQuerySpecError(`measures: unknown measure '${name}'.`);
    if (columns.some((column) => column.name === name))
      throw new AnalyticsQuerySpecError(`measures: '${name}' has the same name as a dimension.`);
    select.push(measureExpression(measure, measures, bind, agg));
    columns.push({ name, label: measure.label || name, role: 'measure', type: 'number' });
  }

  const where = [summary ? 's.summary_id = $1' : 'r.dataset_version_id = $1'];
  for (const filter of query.filters) where.push(filterSql(filter, fieldType(filter.field, 'filters'), fieldText, bind));

  const orderBy = query.sort.map((sort) => {
    const position = columns.findIndex((column) => column.name === sort.by);
    if (position < 0) throw new AnalyticsQuerySpecError(`sort: '${sort.by}' is not an output column.`);
    return `${position + 1} ${sort.direction === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
  });
  if (orderBy.length === 0) for (let i = 1; i <= groupCount; i += 1) orderBy.push(`${i} ASC NULLS LAST`);

  const text = [
    `SELECT ${select.map((expression, index) => `${expression} AS c${index}`).join(', ')}`,
    summary ? 'FROM gigalibs_analytics.analytics_summary_rows s' : 'FROM gigalibs_analytics.dataset_record_versions r',
    `WHERE ${where.join(' AND ')}`,
    groupCount > 0 ? `GROUP BY ${Array.from({ length: groupCount }, (_, i) => i + 1).join(', ')}` : '',
    orderBy.length > 0 ? `ORDER BY ${orderBy.join(', ')}` : '',
    `LIMIT ${bind(query.limit + 1)}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { text, params, columns };
}

function measureExpression(
  measure: QueryMeasure,
  measures: ReadonlyMap<string, QueryMeasure>,
  bind: (value: unknown) => string,
  agg: (measure: QueryMeasure) => string,
): string {
  if (measure.formulaExpression) return formulaExpression(measure.formulaExpression, measures, bind, agg);
  return agg(measure);
}

function aggregate(measure: QueryMeasure, bind: (value: unknown) => string): string {
  if (!measure.aggregateFn || !measure.fieldReference) {
    throw new AnalyticsQuerySpecError(`measures: '${measure.name}' has an incomplete base-measure definition.`);
  }
  switch (measure.aggregateFn) {
    case 'SUM':
      return `COALESCE(SUM((r.analytical_payload->>${bind(measure.fieldReference)}::text)::numeric), 0)`;
    case 'AVG':
      return `AVG((r.analytical_payload->>${bind(measure.fieldReference)}::text)::numeric)`;
    case 'MIN':
      return `MIN((r.analytical_payload->>${bind(measure.fieldReference)}::text)::numeric)`;
    case 'MAX':
      return `MAX((r.analytical_payload->>${bind(measure.fieldReference)}::text)::numeric)`;
    case 'COUNT':
      return 'COUNT(*)';
    case 'COUNT_DISTINCT':
      return `COUNT(DISTINCT r.analytical_payload->>${bind(measure.fieldReference)}::text)`;
    default:
      throw new AnalyticsQuerySpecError(`measures: '${measure.name}' uses unsupported aggregate '${measure.aggregateFn}'.`);
  }
}

/**
 * The same base measure over summary rows: sums of sums, sums of counts, minimum of minimums and maximum of maximums,
 * so the answer equals the one over raw rows. COUNT_DISTINCT cannot be summed, so `summaryCovers` never picks a
 * summary for it.
 */
function summaryAggregate(measure: QueryMeasure, numericFields: readonly string[]): string {
  if (measure.aggregateFn === 'COUNT') return 'COALESCE(SUM(s.row_count), 0)';
  const position = numericFields.indexOf(measure.fieldReference ?? '');
  if (position < 0) throw new AnalyticsQuerySpecError(`summary: measure '${measure.name}' uses a field the summary does not hold.`);
  const part = (array: 'sums' | 'counts' | 'mins' | 'maxs') => `s.${array}[${position + 1}]`;
  switch (measure.aggregateFn) {
    case 'SUM':
      return `COALESCE(SUM(${part('sums')}), 0)`;
    case 'AVG':
      return `(SUM(${part('sums')}) / NULLIF(SUM(${part('counts')}), 0))`;
    case 'MIN':
      return `MIN(${part('mins')})`;
    case 'MAX':
      return `MAX(${part('maxs')})`;
    default:
      throw new AnalyticsQuerySpecError(`summary: measure '${measure.name}' (${measure.aggregateFn}) cannot be answered from a summary.`);
  }
}

function formulaExpression(
  expression: FormulaExpressionV1,
  measures: ReadonlyMap<string, QueryMeasure>,
  bind: (value: unknown) => string,
  agg: (measure: QueryMeasure) => string,
): string {
  if (expression.kind === 'constant') return `${bind(expression.value)}::numeric`;
  if (expression.kind === 'measure') {
    const referenced = measures.get(expression.name);
    if (!referenced || referenced.formulaExpression) {
      throw new AnalyticsQuerySpecError(`formula: unknown base measure '${expression.name}'.`);
    }
    return agg(referenced);
  }
  const left = formulaExpression(expression.left, measures, bind, agg);
  const right = formulaExpression(expression.right, measures, bind, agg);
  switch (expression.operator) {
    case 'add':
      return `((${left}) + (${right}))`;
    case 'subtract':
      return `((${left}) - (${right}))`;
    case 'multiply':
      return `((${left}) * (${right}))`;
    case 'divide':
      // A zero or missing denominator is an unknown ratio, never Infinity or an exception.
      return `((${left}) / NULLIF((${right}), 0))`;
  }
}

function filterSql(
  filter: AnalyticsFilterV1,
  type: AnalyticsFieldType,
  fieldText: (name: string) => string,
  bind: (value: unknown) => string,
): string {
  const left = `${fieldText(filter.field)}${CAST[type]}`;
  const value = (raw: unknown) => `${bind(coerce(raw, type, filter.field))}${CAST[type]}`;
  switch (filter.op) {
    case 'eq':
      return `${left} = ${value(filter.value)}`;
    case 'neq':
      return `${left} IS DISTINCT FROM ${value(filter.value)}`;
    case 'in':
      return `${left} = ANY(${bind(filter.values.map((raw) => coerce(raw, type, filter.field)))}${CAST[type]}[])`;
    case 'gte':
    case 'lte':
    case 'between': {
      if (!ORDERED_TYPES.has(type))
        throw new AnalyticsQuerySpecError(`filters: '${filter.op}' needs a number, date or timestamp field; '${filter.field}' is ${type}.`);
      if (filter.op === 'gte') return `${left} >= ${value(filter.value)}`;
      if (filter.op === 'lte') return `${left} <= ${value(filter.value)}`;
      return `${left} BETWEEN ${value(filter.from)} AND ${value(filter.to)}`;
    }
  }
}

function coerce(raw: unknown, type: AnalyticsFieldType, field: string): string | number | boolean {
  const fail = () => new AnalyticsQuerySpecError(`filters: value ${JSON.stringify(raw)} does not fit ${type} field '${field}'.`);
  switch (type) {
    case 'number':
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      throw fail();
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      throw fail();
    case 'date':
    case 'timestamp':
      if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) return raw;
      throw fail();
    case 'string':
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      throw fail();
  }
}
