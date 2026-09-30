import { z } from 'zod';

// WI-OI-103a (ADR-0016 F13): the analytics query contract. A question is "measures by dimensions, per time grain,
// filtered and sorted"; the answer is typed rows. Charts, dashboards and reports store this query, never data, so the
// same data can be shown with any chart that fits it.

/** Field names come from the published mapping's analytical fields; the engine whitelists them. */
export const AnalyticsFieldNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, 'Field names are letters, digits and underscores (max 64).');
const AnalyticsMeasureNameSchema = z.string().min(1).max(64);
export const AnalyticsScalarSchema = z.union([z.string().max(256), z.number().finite(), z.boolean()]);

export const AnalyticsTimeGrainSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);
export type AnalyticsTimeGrain = z.infer<typeof AnalyticsTimeGrainSchema>;

export const AnalyticsFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date', 'timestamp']);
export type AnalyticsFieldType = z.infer<typeof AnalyticsFieldTypeSchema>;

export const AnalyticsFilterV1Schema = z.discriminatedUnion('op', [
  z.object({ field: AnalyticsFieldNameSchema, op: z.literal('eq'), value: AnalyticsScalarSchema }).strict(),
  z.object({ field: AnalyticsFieldNameSchema, op: z.literal('neq'), value: AnalyticsScalarSchema }).strict(),
  z
    .object({ field: AnalyticsFieldNameSchema, op: z.literal('in'), values: z.array(AnalyticsScalarSchema).min(1).max(100) })
    .strict(),
  z.object({ field: AnalyticsFieldNameSchema, op: z.literal('gte'), value: AnalyticsScalarSchema }).strict(),
  z.object({ field: AnalyticsFieldNameSchema, op: z.literal('lte'), value: AnalyticsScalarSchema }).strict(),
  z
    .object({ field: AnalyticsFieldNameSchema, op: z.literal('between'), from: AnalyticsScalarSchema, to: AnalyticsScalarSchema })
    .strict(),
]);
export type AnalyticsFilterV1 = z.infer<typeof AnalyticsFilterV1Schema>;

export const AnalyticsQueryV1Schema = z
  .object({
    semanticModelId: z.string().uuid(),
    measures: z.array(AnalyticsMeasureNameSchema).min(1).max(10),
    /** Formula measures may be pinned to any previously published immutable version. */
    measureVersions: z.record(AnalyticsMeasureNameSchema, z.string().uuid()).default({}),
    dimensions: z.array(AnalyticsFieldNameSchema).max(3).default([]),
    time: z.object({ field: AnalyticsFieldNameSchema, grain: AnalyticsTimeGrainSchema }).strict().optional(),
    filters: z.array(AnalyticsFilterV1Schema).max(20).default([]),
    sort: z
      .array(z.object({ by: z.string().min(1).max(64), direction: z.enum(['asc', 'desc']) }).strict())
      .max(3)
      .default([]),
    limit: z.number().int().min(1).max(10_000).default(1_000),
  })
  .strict()
  .refine((query) => new Set(query.dimensions).size === query.dimensions.length, 'Dimensions must be distinct.')
  .refine((query) => new Set(query.measures).size === query.measures.length, 'Measures must be distinct.')
  .refine(
    (query) => Object.keys(query.measureVersions).every((name) => query.measures.includes(name)),
    'Every pinned measure version must name a selected measure.',
  );
export type AnalyticsQueryV1 = z.infer<typeof AnalyticsQueryV1Schema>;
export type AnalyticsQueryInputV1 = z.input<typeof AnalyticsQueryV1Schema>;

export const AnalyticsQueryColumnV1Schema = z.object({
  name: z.string(),
  label: z.string(),
  role: z.enum(['time', 'dimension', 'measure']),
  type: AnalyticsFieldTypeSchema,
});
export type AnalyticsQueryColumnV1 = z.infer<typeof AnalyticsQueryColumnV1Schema>;

export const AnalyticsQueryResultV1Schema = z.object({
  semanticModelId: z.string(),
  datasetVersionId: z.string(),
  definitionVersion: z.number().int(),
  /** Formula measure versions actually used, keyed by measure name. Base measures are omitted. */
  measureVersions: z.record(AnalyticsMeasureNameSchema, z.string().uuid()).default({}),
  asOf: z.string(),
  freshness: z.enum(['FRESH', 'STALE', 'PARTIAL', 'REBUILDING', 'UNAVAILABLE']),
  watermark: z.string().nullable(),
  columns: z.array(AnalyticsQueryColumnV1Schema),
  /** One array per row, in `columns` order. The rows are also the accessible table equivalent of any chart. */
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  /** True when more rows matched than `limit`. */
  truncated: z.boolean(),
});
export type AnalyticsQueryResultV1 = z.infer<typeof AnalyticsQueryResultV1Schema>;
