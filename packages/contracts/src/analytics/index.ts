import { z } from 'zod';

// ─── Operational facts and place drill-down (WI-OI-064b) ─────────────────────

export const OperationalFactTypeV1Schema = z.enum([
  'LABOUR_HOURS',
  'LABOUR_COST',
  'SPEND',
  'DOWNTIME_MINUTES',
  'CARBON_KG',
]);
export type OperationalFactTypeV1 = z.infer<typeof OperationalFactTypeV1Schema>;

/** Longest drill-down or rebuild window, in days. */
export const MAX_PLACE_ANALYTICS_WINDOW_DAYS = 366;

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-09-01.').refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value),
  'Use a real calendar date.',
);

const windowDays = (value: { from: string; to: string }) =>
  (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000;

const DateWindowSchema = z
  .object({ from: IsoDateSchema, to: IsoDateSchema })
  .refine((value) => windowDays(value) >= 0 && windowDays(value) < MAX_PLACE_ANALYTICS_WINDOW_DAYS, {
    message: `Use a window of 1 to ${MAX_PLACE_ANALYTICS_WINDOW_DAYS} days with from on or before to.`,
    path: ['to'],
  });

/** Place path at event time, as recorded by Geospatial (`APAC.BLR_01`); empty means the whole estate. */
export const PlaceAnalyticsPathSchema = z
  .string()
  .regex(/^([A-Za-z0-9_]{1,63}(\.[A-Za-z0-9_]{1,63}){0,31})?$/, 'Use a place path such as APAC.BLR_01.');

export const PlaceDrilldownQueryV1Schema = z
  .object({
    factType: OperationalFactTypeV1Schema,
    under: PlaceAnalyticsPathSchema.default(''),
    from: IsoDateSchema,
    to: IsoDateSchema,
  })
  .superRefine((value, context) => {
    const result = DateWindowSchema.safeParse({ from: value.from, to: value.to });
    if (!result.success) context.addIssue({ code: 'custom', path: ['to'], message: result.error.issues[0]!.message });
  });
export type PlaceDrilldownQueryV1 = z.infer<typeof PlaceDrilldownQueryV1Schema>;

export const PlaceDrilldownV1Schema = z.object({
  factType: OperationalFactTypeV1Schema,
  under: z.string(),
  from: z.string(),
  to: z.string(),
  items: z.array(
    z.object({
      path: z.string(),
      /** Last path segment (the place code). */
      code: z.string(),
      /** Facts recorded on `under` itself rather than on a place inside it. */
      self: z.boolean(),
      quantity: z.number(),
      factCount: z.number().int().nonnegative(),
    }),
  ),
  total: z.number(),
  generatedAt: z.string(),
});
export type PlaceDrilldownV1 = z.infer<typeof PlaceDrilldownV1Schema>;

export const RebuildPlaceRollupsV1Schema = DateWindowSchema;
export type RebuildPlaceRollupsV1 = z.infer<typeof RebuildPlaceRollupsV1Schema>;

// ─── Metric drill-down (WI-OI-064d) ──────────────────────────────────────────

export const MetricUnitSchema = z.enum(['HOURS', 'MINUTES', 'CURRENCY', 'KG', 'COUNT', 'RATIO']);
export type MetricUnit = z.infer<typeof MetricUnitSchema>;

const MetricKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'Use lower-case letters, digits or underscores.');
const MetricLabelSchema = z.string().trim().min(1).max(120);

/** One side of a metric: a fact type summed (`SUM`) or counted (`COUNT`) over the rollups. */
export const MetricAggregateSpecV1Schema = z
  .object({ factType: OperationalFactTypeV1Schema, aggregate: z.enum(['SUM', 'COUNT']) })
  .strict();

/** A metric resolved from the activated catalogue into typed, allowlisted parts. */
export const MetricSpecV1Schema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('AGGREGATE'), key: MetricKeySchema, label: MetricLabelSchema, unit: MetricUnitSchema })
    .extend(MetricAggregateSpecV1Schema.shape)
    .strict(),
  z
    .object({
      kind: z.literal('RATIO'),
      key: MetricKeySchema,
      label: MetricLabelSchema,
      unit: MetricUnitSchema,
      numerator: MetricAggregateSpecV1Schema,
      denominator: MetricAggregateSpecV1Schema,
    })
    .strict(),
]);
export type MetricSpecV1 = z.infer<typeof MetricSpecV1Schema>;

export const MetricDrilldownRequestV1Schema = z
  .object({
    metric: MetricSpecV1Schema,
    under: PlaceAnalyticsPathSchema.default(''),
    from: IsoDateSchema,
    to: IsoDateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const result = DateWindowSchema.safeParse({ from: value.from, to: value.to });
    if (!result.success) context.addIssue({ code: 'custom', path: ['to'], message: result.error.issues[0]!.message });
  });
export type MetricDrilldownRequestV1 = z.infer<typeof MetricDrilldownRequestV1Schema>;

const MetricValueSchema = z.object({
  /** The metric value; a ratio with a zero or missing denominator is null. */
  value: z.number().nullable(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
});

export const MetricDrilldownV1Schema = z.object({
  metric: z.object({ key: z.string(), label: z.string(), unit: MetricUnitSchema, kind: z.enum(['AGGREGATE', 'RATIO']) }),
  under: z.string(),
  from: z.string(),
  to: z.string(),
  items: z.array(MetricValueSchema.extend({ path: z.string(), code: z.string(), self: z.boolean() })),
  /** Across all children: sums for aggregates; the ratio of summed parts (not a sum of ratios) for ratios. */
  total: MetricValueSchema,
  generatedAt: z.string(),
});
export type MetricDrilldownV1 = z.infer<typeof MetricDrilldownV1Schema>;

// ─── Demo Lab synthetic data (WI-OI-064e) ────────────────────────────────────

/** Most synthetic facts one demo tenant may hold. */
export const MAX_DEMO_LAB_FACTS = 1_000_000;

export const DemoPlaceTypeV1Schema = z
  .object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,40}$/), label: z.string().trim().min(1).max(120) })
  .strict();

/** Shape of an industry's synthetic demo data; amounts are in `currency`. Never used for live reporting. */
export const DemoProfileV1Schema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    regions: z.number().int().min(1).max(50),
    sitesPerRegion: z.number().int().min(1).max(200),
    zonesPerSite: z.number().int().min(0).max(50),
    labourHoursPerSitePerDay: z.number().positive().max(100_000),
    labourCostPerHour: z.number().positive().max(100_000),
    spendPerSitePerDay: z.number().nonnegative().max(10_000_000),
    downtimeMinutesPerSitePerDay: z.number().nonnegative().max(1_440),
    carbonKgPerLabourHour: z.number().nonnegative().max(1_000),
  })
  .strict();
export type DemoProfileV1 = z.infer<typeof DemoProfileV1Schema>;

/** Facts one generation writes: hours, cost and carbon per zone (or site) per day; spend and downtime per site. */
export function estimateDemoLabFacts(profile: DemoProfileV1, days: number): number {
  const sites = profile.regions * profile.sitesPerRegion;
  const leaves = sites * Math.max(profile.zonesPerSite, 1);
  return days * (leaves * 3 + sites * 2);
}

export const DemoLabGenerateRequestV1Schema = z
  .object({
    /** Place levels from the industry pack: region, site and, when zonesPerSite > 0, zone. */
    placeTypes: z.array(DemoPlaceTypeV1Schema).min(2).max(6),
    demoProfile: DemoProfileV1Schema,
    days: z.number().int().min(7).max(MAX_PLACE_ANALYTICS_WINDOW_DAYS),
    endDate: IsoDateSchema,
    seed: z.number().int().min(0).max(2_147_483_647),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.demoProfile.zonesPerSite > 0 && value.placeTypes.length < 3) {
      context.addIssue({ code: 'custom', path: ['placeTypes'], message: 'A profile with zones needs region, site and zone levels.' });
    }
    const facts = estimateDemoLabFacts(value.demoProfile, value.days);
    if (facts > MAX_DEMO_LAB_FACTS) {
      context.addIssue({ code: 'custom', path: ['days'], message: `This would generate ${facts} facts; the Demo Lab limit is ${MAX_DEMO_LAB_FACTS}. Use fewer days.` });
    }
  });
export type DemoLabGenerateRequestV1 = z.infer<typeof DemoLabGenerateRequestV1Schema>;

export const DemoLabDatasetV1Schema = z.object({
  facts: z.number().int().nonnegative(),
  rollupRows: z.number().int().nonnegative(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type DemoLabDatasetV1 = z.infer<typeof DemoLabDatasetV1Schema>;

/** Platform action: create an isolated, labelled Demo Lab tenant for one industry and country. */
export const CreateDemoLabTenantSchema = z
  .object({
    industry: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
    country: z.string().regex(/^[a-z]{2}$/),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type CreateDemoLabTenantDto = z.infer<typeof CreateDemoLabTenantSchema>;

export const DeleteDemoLabTenantSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type DeleteDemoLabTenantDto = z.infer<typeof DeleteDemoLabTenantSchema>;
export * from './query.js';
export * from './catalog.js';
export * from './chart-view.js';
export * from './chart-shape.js';
export * from './formula-measure.js';
export * from './sample-farm.js';
export * from './dashboard.js';
export * from './report.js';
