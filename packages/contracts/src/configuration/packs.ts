import { z } from 'zod';
import { DemoPlaceTypeV1Schema, DemoProfileV1Schema } from '../analytics/index.js';

// ─── Industry and country packs at the solution layer (WI-OI-107, ADR-0016 F10) ──────────────────────────────
// One pack per industry (and one per country) covers every module. A pack has a header and one section per module;
// each section is grouped by the seven layers of WI-OI-074. A module declares in its `module.yaml` which layers it
// reads (`pack.industry`, `pack.country`), and its section schemas live here, so a pack is valid only when every
// section matches its module. Layers without an engine yet (fields, workflows and others) have no schema until
// their item (WI-OI-074 to 078) adds one; the format does not change.
// Pack files live in `solutions/packs/` and are compiled into `packs.generated.ts` by `pnpm modules:catalog`.

/** The seven layers. Layer 7 (`rules`) holds parameters for rules that stay in code, never the rules themselves. */
export const PACK_LAYERS = ['vocabulary', 'fields', 'lists', 'capabilities', 'workflows', 'outcomes', 'rules'] as const;
export type PackLayer = (typeof PACK_LAYERS)[number];

const LabelSchema = z.string().trim().min(1).max(120);
const PackSlugSchema = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, 'Use lower-case letters, digits or hyphens.');
/** `major.minor`: a minor version only adds; a major version may remove (a breaking change for tenants). */
export const PackVersionSchema = z.string().regex(/^[1-9][0-9]{0,3}\.[0-9]{1,4}$/, 'Use major.minor, such as 1.0.');

// ─── Module sections: industry packs ─────────────────────────────────────────

const RoleKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const ClassificationKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/);

/** Workforce (module `gigaops`), layer 1: what work, roles, positions, people and agreements are called. */
export const WorkforcePackVocabularyV1Schema = z
  .object({
    terms: z
      .object({ workUnit: LabelSchema, role: LabelSchema, position: LabelSchema, worker: LabelSchema, agreement: LabelSchema })
      .strict(),
    roleLabels: z.record(RoleKeySchema, LabelSchema).optional(),
    classificationLabels: z.record(ClassificationKeySchema, LabelSchema).optional(),
  })
  .strict();

/** Workforce, layer 3: the certifications the industry expects. */
export const WorkforcePackListsV1Schema = z
  .object({
    certifications: z
      .array(z.object({ slug: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/), label: LabelSchema, required: z.boolean() }).strict())
      .max(50),
  })
  .strict();

/** Workforce, layer 4: which Workforce capabilities the industry uses, and its default pay type. */
export const WorkforcePackCapabilitiesV1Schema = z
  .object({
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
  })
  .strict();

/** Geospatial, layer 3: the place levels from the top of the estate down (seeded as place types). */
export const GeospatialPackListsV1Schema = z.object({ placeTypes: z.array(DemoPlaceTypeV1Schema).min(1).max(6) }).strict();

// ─── Module sections: country packs ──────────────────────────────────────────

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

/** Workforce, layer 7: parameters for its coded working-time and pay rules, and its export formats. */
export const WorkforceCountryRulesV1Schema = z
  .object({
    weeklyOtThreshold: z.number().positive().max(168),
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
  .strict();

/** Every module section a pack may carry, by pack kind, module and layer. */
export const PACK_SECTION_SCHEMAS = {
  industry: {
    gigaops: {
      vocabulary: WorkforcePackVocabularyV1Schema,
      lists: WorkforcePackListsV1Schema,
      capabilities: WorkforcePackCapabilitiesV1Schema,
    },
    geospatial: { lists: GeospatialPackListsV1Schema },
  },
  country: {
    gigaops: { rules: WorkforceCountryRulesV1Schema },
  },
} as const;

export type PackKind = keyof typeof PACK_SECTION_SCHEMAS;
/** The modules that read packs, by kind. */
export const PACK_MODULES = {
  industry: Object.keys(PACK_SECTION_SCHEMAS.industry) as Array<keyof typeof PACK_SECTION_SCHEMAS.industry>,
  country: Object.keys(PACK_SECTION_SCHEMAS.country) as Array<keyof typeof PACK_SECTION_SCHEMAS.country>,
};

/** Each module's whole section of a pack: its layers, each optional. Modules parse what they are sent with these. */
export const WorkforceIndustrySectionV1Schema = z
  .object({
    vocabulary: WorkforcePackVocabularyV1Schema,
    lists: WorkforcePackListsV1Schema,
    capabilities: WorkforcePackCapabilitiesV1Schema,
  })
  .partial()
  .strict();
export const GeospatialIndustrySectionV1Schema = z.object({ lists: GeospatialPackListsV1Schema }).partial().strict();
export const WorkforceCountrySectionV1Schema = z.object({ rules: WorkforceCountryRulesV1Schema }).partial().strict();

const IndustryPackModulesSchema = z
  .object({ gigaops: WorkforceIndustrySectionV1Schema.optional(), geospatial: GeospatialIndustrySectionV1Schema.optional() })
  .strict();

const CountryPackModulesSchema = z.object({ gigaops: WorkforceCountrySectionV1Schema.optional() }).strict();

/** One industry: a header, one section per module, and the synthetic Demo Lab profile (never live reporting). */
export const IndustryPackV2Schema = z
  .object({
    formatVersion: z.literal(2),
    slug: PackSlugSchema,
    label: LabelSchema,
    emoji: z.string().max(8).optional(),
    version: PackVersionSchema,
    description: z.string().trim().max(500).optional(),
    modules: IndustryPackModulesSchema,
    /** Demo Lab only: the shape of synthetic data generated for this industry. */
    demo: DemoProfileV1Schema.optional(),
  })
  .strict();
export type IndustryPackV2 = z.infer<typeof IndustryPackV2Schema>;

/** One country: currency, time zones, ISO 3166-2 jurisdictions, retention, and one section per module. */
export const CountryPackV2Schema = z
  .object({
    formatVersion: z.literal(2),
    code: z.string().regex(/^([A-Z]{2})$/, 'Use an ISO 3166-1 alpha-2 code or EU.'),
    label: LabelSchema,
    version: PackVersionSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    timeZones: z.array(z.string().regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/)).min(1).max(20),
    subdivisions: z.array(z.object({ code: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/), label: LabelSchema }).strict()).max(100),
    dataRetentionMonths: z.number().int().positive().max(240),
    modules: CountryPackModulesSchema,
  })
  .strict()
  .superRefine((pack, context) => {
    pack.subdivisions.forEach((subdivision, index) => {
      if (!subdivision.code.startsWith(`${pack.code}-`)) {
        context.addIssue({ code: 'custom', path: ['subdivisions', index, 'code'], message: `${subdivision.code} is not a subdivision of ${pack.code}.` });
      }
    });
  });
export type CountryPackV2 = z.infer<typeof CountryPackV2Schema>;

/**
 * What a module is sent when a pack is activated for a tenant (kernel job `pack.apply`): which pack and version,
 * and only that module's section.
 */
export const PackApplicationV1Schema = z
  .object({
    kind: z.enum(['INDUSTRY', 'COUNTRY']),
    key: z.string().regex(/^[a-z][a-z0-9-]{0,62}$|^[A-Z]{2}$/),
    version: PackVersionSchema,
    checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    /** Configuration Studio's published version id (a cuid). */
    publishedVersionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    // Keys are layer names; a record keyed by the enum would add every missing layer as undefined.
    section: z.record(z.string(), z.unknown()).refine(
      (section) => Object.keys(section).every((layer) => (PACK_LAYERS as readonly string[]).includes(layer)),
      { message: `Section keys must be pack layers (${PACK_LAYERS.join(', ')}).` },
    ),
  })
  .strict();
export type PackApplicationV1 = z.infer<typeof PackApplicationV1Schema>;

/** Validates a module's section of an application against that module's layer schemas. */
export function parsePackSection<K extends PackKind, M extends keyof (typeof PACK_SECTION_SCHEMAS)[K]>(
  kind: K,
  moduleKey: M,
  section: unknown,
) {
  const layers = PACK_SECTION_SCHEMAS[kind][moduleKey] as Record<string, z.ZodTypeAny>;
  return z.object(Object.fromEntries(Object.entries(layers).map(([layer, schema]) => [layer, schema.optional()]))).strict().safeParse(section);
}
