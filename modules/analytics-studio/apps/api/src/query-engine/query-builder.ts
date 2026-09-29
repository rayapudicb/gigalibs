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
} from '@gigalibs/contracts';

export interface QueryMeasure {
  readonly name: string;
  readonly aggregateFn: string;
  readonly fieldReference: string;
  readonly label: string;
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

export function buildAnalyticsQuery(input: {
  readonly datasetVersionId: string;
  readonly query: AnalyticsQueryV1;
  readonly fields: ReadonlyMap<string, AnalyticsFieldType>;
  readonly measures: ReadonlyMap<string, QueryMeasure>;
}): BuiltAnalyticsQuery {
  const { query, fields, measures } = input;
  const params: unknown[] = [input.datasetVersionId];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const fieldType = (name: string, where: string): AnalyticsFieldType => {
    const type = fields.get(name);
    if (!type) throw new AnalyticsQuerySpecError(`${where}: unknown field '${name}'.`);
    return type;
  };
  const fieldText = (name: string): string => `(r.analytical_payload->>${bind(name)}::text)`;

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
    select.push(aggregate(measure, bind));
    columns.push({ name, label: measure.label || name, role: 'measure', type: 'number' });
  }

  const where = ['r.dataset_version_id = $1'];
  for (const filter of query.filters) where.push(filterSql(filter, fieldType(filter.field, 'filters'), fieldText, bind));

  const orderBy = query.sort.map((sort) => {
    const position = columns.findIndex((column) => column.name === sort.by);
    if (position < 0) throw new AnalyticsQuerySpecError(`sort: '${sort.by}' is not an output column.`);
    return `${position + 1} ${sort.direction === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
  });
  if (orderBy.length === 0) for (let i = 1; i <= groupCount; i += 1) orderBy.push(`${i} ASC NULLS LAST`);

  const text = [
    `SELECT ${select.map((expression, index) => `${expression} AS c${index}`).join(', ')}`,
    'FROM gigalibs_analytics.dataset_record_versions r',
    `WHERE ${where.join(' AND ')}`,
    groupCount > 0 ? `GROUP BY ${Array.from({ length: groupCount }, (_, i) => i + 1).join(', ')}` : '',
    orderBy.length > 0 ? `ORDER BY ${orderBy.join(', ')}` : '',
    `LIMIT ${bind(query.limit + 1)}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { text, params, columns };
}

function aggregate(measure: QueryMeasure, bind: (value: unknown) => string): string {
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
