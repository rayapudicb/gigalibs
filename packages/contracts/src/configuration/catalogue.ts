import { z } from 'zod';
import {
  DemoPlaceTypeV1Schema,
  DemoProfileV1Schema,
  MetricUnitSchema,
  OperationalFactTypeV1Schema,
  type MetricSpecV1,
} from '../analytics/index.js';

// ─── Governed catalogue definitions (WI-OI-064c) ─────────────────────────────
// Metric catalogues, industry packs and country packs use Configuration Studio's change set → approval →
// publish → activation lifecycle (owner decision 2026-09-26). They are typed data, never code or SQL.

const CatalogueKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'Use lower-case letters, digits or underscores.');
const LabelSchema = z.string().trim().min(1).max(120);


export const MetricDefinitionV1Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('AGGREGATE'),
    key: CatalogueKeySchema,
    label: LabelSchema,
    unit: MetricUnitSchema,
    factType: OperationalFactTypeV1Schema,
    aggregate: z.enum(['SUM', 'COUNT']),
    description: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    kind: z.literal('RATIO'),
    key: CatalogueKeySchema,
    label: LabelSchema,
    unit: MetricUnitSchema,
    numerator: CatalogueKeySchema,
    denominator: CatalogueKeySchema,
    description: z.string().trim().max(500).optional(),
  }).strict(),
]);
export type MetricDefinitionV1 = z.infer<typeof MetricDefinitionV1Schema>;

export const MetricCatalogueV1Schema = z
  .object({ metrics: z.array(MetricDefinitionV1Schema).min(1).max(50) })
  .strict()
  .superRefine((catalogue, context) => {
    const aggregates = new Set<string>();
    const keys = new Set<string>();
    catalogue.metrics.forEach((metric, index) => {
      if (keys.has(metric.key)) context.addIssue({ code: 'custom', path: ['metrics', index, 'key'], message: `Duplicate metric ${metric.key}.` });
      keys.add(metric.key);
      if (metric.kind === 'AGGREGATE') aggregates.add(metric.key);
    });
    catalogue.metrics.forEach((metric, index) => {
      if (metric.kind !== 'RATIO') return;
      for (const side of ['numerator', 'denominator'] as const) {
        if (!aggregates.has(metric[side])) {
          context.addIssue({ code: 'custom', path: ['metrics', index, side], message: `${metric[side]} must be an aggregate metric in this catalogue.` });
        }
      }
    });
  });
export type MetricCatalogueV1 = z.infer<typeof MetricCatalogueV1Schema>;

const SlugSchema = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, 'Use lower-case letters, digits or hyphens.');

/** One industry template: vocabulary, certifications, features, place levels and the synthetic demo profile. */
export const IndustryPackV1Schema = z
  .object({
    slug: SlugSchema,
    label: LabelSchema,
    emoji: z.string().max(8).optional(),
    terminology: z
      .object({ workUnit: LabelSchema, role: LabelSchema, position: LabelSchema, worker: LabelSchema, agreement: LabelSchema })
      .strict(),
    roleLabels: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,62}$/), LabelSchema).optional(),
    classificationLabels: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/), LabelSchema).optional(),
    requiredCertifications: z
      .array(
        z
          .object({ slug: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/), label: LabelSchema, required: z.boolean() })
          .strict(),
      )
      .max(50),
    defaultPayTypeCode: z.string().regex(/^[A-Z0-9][A-Z0-9_]{0,15}$/),
    features: z
      .object({
        perDiem: z.boolean(),
        flatRates: z.boolean(),
        guaranteedHours: z.boolean(),
        unionSupport: z.boolean(),
        vendorPay: z.boolean(),
        clockPunches: z.boolean(),
        mobileTimesheet: z.boolean(),
      })
      .strict(),
    /** Place levels from the top of the estate down, used to seed Sites & Zones place types. */
    placeTypes: z.array(DemoPlaceTypeV1Schema).min(1).max(6),
    /** Shape of synthetic demo data generated for this industry (Demo Lab only; never live reporting). */
    demoProfile: DemoProfileV1Schema,
  })
  .strict();
export type IndustryPackV1 = z.infer<typeof IndustryPackV1Schema>;

const PayrollCapSchema = z.number().nonnegative().nullable();
const PayrollRulesSchema = z
  .object({
    dailyRegularCap: PayrollCapSchema,
    dailyOtCap: PayrollCapSchema,
    otMultiplier: z.number().min(1).max(5),
    dtMultiplier: z.number().min(1).max(5).nullable(),
    seventhDayRule: z.boolean(),
  })
  .strict();

/** One country: currency, time zones, ISO 3166-2 jurisdictions and statutory working-time defaults. */
export const CountryPackV1Schema = z
  .object({
    code: z.string().regex(/^([A-Z]{2})$/, 'Use an ISO 3166-1 alpha-2 code or EU.'),
    label: LabelSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    timeZones: z.array(z.string().regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/)).min(1).max(20),
    subdivisions: z
      .array(z.object({ code: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/), label: LabelSchema }).strict())
      .max(100),
    weeklyOtThreshold: z.number().positive().max(168),
    dataRetentionMonths: z.number().int().positive().max(240),
    payroll: PayrollRulesSchema.extend({
      type: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
      holidayRegularCap: PayrollCapSchema.optional(),
      holidayOtMultiplier: z.number().min(1).max(5).nullable().optional(),
      holidayDtMultiplier: z.number().min(1).max(5).nullable().optional(),
      stateRules: z.record(z.string().regex(/^[A-Z0-9-]{2,6}$/), PayrollRulesSchema).optional(),
      deductions: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,62}$/), z.union([z.number(), z.boolean()])).optional(),
    }).strict(),
    exportFormats: z
      .array(z.object({ code: z.string().regex(/^[A-Z0-9_]{1,16}$/), label: LabelSchema, periodDays: z.number().int().min(1).max(31) }).strict())
      .max(20),
  })
  .strict()
  .superRefine((pack, context) => {
    pack.subdivisions.forEach((subdivision, index) => {
      if (!subdivision.code.startsWith(`${pack.code}-`)) {
        context.addIssue({ code: 'custom', path: ['subdivisions', index, 'code'], message: `${subdivision.code} is not a subdivision of ${pack.code}.` });
      }
    });
  });
export type CountryPackV1 = z.infer<typeof CountryPackV1Schema>;

export const GovernedCatalogueKindSchema = z.enum(['METRIC_CATALOGUE', 'INDUSTRY_PACK', 'COUNTRY_PACK']);
export type GovernedCatalogueKind = z.infer<typeof GovernedCatalogueKindSchema>;

/** Where each catalogue kind lives in Configuration Studio's module/entity/surface identity. */
export const GOVERNED_CATALOGUE_SCOPES = Object.freeze({
  METRIC_CATALOGUE: Object.freeze({ moduleKey: 'analytics-studio', entityKey: 'metric-catalogue' }),
  INDUSTRY_PACK: Object.freeze({ moduleKey: 'gigaops', entityKey: 'industry-pack' }),
  COUNTRY_PACK: Object.freeze({ moduleKey: 'gigaops', entityKey: 'country-pack' }),
} satisfies Record<GovernedCatalogueKind, { moduleKey: string; entityKey: string }>);

const KebabKeySchema = z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Use lowercase kebab-case');
const catalogueEnvelope = {
  contractVersion: z.literal('1.0'),
  surfaceKey: KebabKeySchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
};

/**
 * A governed catalogue stored, approved, published and activated through Configuration Studio like a surface
 * definition. `surfaceKey` names the catalogue within its kind (`operations`, `qsr`, `jp`).
 */
export const GovernedCatalogueDefinitionSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...catalogueEnvelope,
      kind: z.literal('METRIC_CATALOGUE'),
      moduleKey: z.literal('analytics-studio'),
      entityKey: z.literal('metric-catalogue'),
      catalogue: MetricCatalogueV1Schema,
    }).strict(),
    z.object({
      ...catalogueEnvelope,
      kind: z.literal('INDUSTRY_PACK'),
      moduleKey: z.literal('gigaops'),
      entityKey: z.literal('industry-pack'),
      catalogue: IndustryPackV1Schema,
    }).strict(),
    z.object({
      ...catalogueEnvelope,
      kind: z.literal('COUNTRY_PACK'),
      moduleKey: z.literal('gigaops'),
      entityKey: z.literal('country-pack'),
      catalogue: CountryPackV1Schema,
    }).strict(),
  ])
  .superRefine((definition, context) => {
    const expected =
      definition.kind === 'INDUSTRY_PACK'
        ? definition.catalogue.slug
        : definition.kind === 'COUNTRY_PACK'
          ? definition.catalogue.code.toLowerCase()
          : null;
    if (expected !== null && definition.surfaceKey !== expected) {
      context.addIssue({ code: 'custom', path: ['surfaceKey'], message: `Use ${expected} as the key for this pack.` });
    }
  });
export type GovernedCatalogueDefinition = z.infer<typeof GovernedCatalogueDefinitionSchema>;

export function isGovernedCatalogueDefinition(value: unknown): value is { kind: GovernedCatalogueKind } {
  return !!value && typeof value === 'object' && 'kind' in value && GovernedCatalogueKindSchema.safeParse((value as { kind: unknown }).kind).success;
}

export const InstallGovernedCatalogueSchema = z
  .object({
    kind: GovernedCatalogueKindSchema,
    surfaceKey: KebabKeySchema,
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();
export type InstallGovernedCatalogueDto = z.infer<typeof InstallGovernedCatalogueSchema>;

export const GovernedCatalogueQuerySchema = z
  .object({ kind: GovernedCatalogueKindSchema, surfaceKey: KebabKeySchema })
  .strict();

/** Resolves a catalogue metric into the typed spec Analytics executes, or undefined for an unknown key. */
export function resolveMetricSpec(catalogue: MetricCatalogueV1, key: string): MetricSpecV1 | undefined {
  const metric = catalogue.metrics.find((candidate) => candidate.key === key);
  if (!metric) return undefined;
  if (metric.kind === 'AGGREGATE') {
    return { kind: 'AGGREGATE', key: metric.key, label: metric.label, unit: metric.unit, factType: metric.factType, aggregate: metric.aggregate };
  }
  const side = (sideKey: string) => {
    const part = catalogue.metrics.find((candidate) => candidate.key === sideKey);
    return part?.kind === 'AGGREGATE' ? { factType: part.factType, aggregate: part.aggregate } : undefined;
  };
  const numerator = side(metric.numerator);
  const denominator = side(metric.denominator);
  if (!numerator || !denominator) return undefined;
  return { kind: 'RATIO', key: metric.key, label: metric.label, unit: metric.unit, numerator, denominator };
}
