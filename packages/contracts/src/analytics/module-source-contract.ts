import { z } from 'zod';

/** How organization ownership is enforced for facts from this source. */
export const ModuleAnalyticsOwnerScopePolicyV1Schema = z.enum([
  'UNIT_REQUIRED',
  'TENANT_SHARED_EXPLICIT',
  'PLACE_SCOPED',
]);
export type ModuleAnalyticsOwnerScopePolicyV1 = z.infer<typeof ModuleAnalyticsOwnerScopePolicyV1Schema>;

export const ModuleAnalyticsDataClassificationV1Schema = z.enum([
  'OPERATIONAL',
  'FINANCIAL',
  'PERSONAL',
  'CONFIDENTIAL',
]);
export type ModuleAnalyticsDataClassificationV1 = z.infer<typeof ModuleAnalyticsDataClassificationV1Schema>;

const SourceKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,62}$/, 'sourceKey must be kebab-case and globally unique within the platform registry.');

const CatalogModuleKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,62}$/, 'catalogModuleKey must match the platform module catalogue entitlement key.');

const PermissionCodeSchema = z
  .string()
  .regex(
    /^(?:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?|[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,3})$/,
    'requiredReadPermission must be a tenant permission code.',
  );

const MeasureAggregationV1Schema = z.enum(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'RATIO']);

export const ModuleAnalyticsMeasureV1Schema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    label: z.string().trim().min(1).max(120),
    aggregation: MeasureAggregationV1Schema,
    unit: z.string().trim().min(1).max(32),
    precision: z.number().int().min(0).max(6),
    /** Field on the fact payload used as the measure input; not arbitrary SQL. */
    factField: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    reversalPolicy: z.enum(['NET', 'ABSOLUTE', 'IGNORE']).default('NET'),
  })
  .strict();
export type ModuleAnalyticsMeasureV1 = z.infer<typeof ModuleAnalyticsMeasureV1Schema>;

export const ModuleAnalyticsDimensionV1Schema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    label: z.string().trim().min(1).max(120),
    factField: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  })
  .strict();
export type ModuleAnalyticsDimensionV1 = z.infer<typeof ModuleAnalyticsDimensionV1Schema>;

export const ModuleAnalyticsDefaultViewV1Schema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    label: z.string().trim().min(1).max(120),
    /** KPI row measure keys (up to four). */
    kpiMeasureKeys: z.array(z.string()).min(1).max(4),
    trendMeasureKey: z.string(),
    breakdownDimensionKey: z.string(),
    actionTableKey: z.string().optional(),
  })
  .strict();
export type ModuleAnalyticsDefaultViewV1 = z.infer<typeof ModuleAnalyticsDefaultViewV1Schema>;

export const ModuleAnalyticsFactSchemaV1Schema = z
  .object({
    schemaVersion: z.number().int().min(1).max(9999),
    primaryKeyField: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    eventTimeField: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    ownerUnitIdField: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
    ownerPlaceIdField: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.ownerUnitIdField && !value.ownerPlaceIdField) {
      context.addIssue({
        code: 'custom',
        message: 'factSchema must declare ownerUnitIdField and/or ownerPlaceIdField for scope enforcement.',
        path: ['ownerUnitIdField'],
      });
    }
  });

/**
 * Versioned declaration of one MODULE_EVENTS analytics source owned by a business module.
 * `catalogModuleKey` is the tenant entitlement key from the platform catalogue, not the runtime package directory.
 */
export const ModuleAnalyticsSourceContractV1Schema = z
  .object({
    contractVersion: z.literal(1),
    catalogModuleKey: CatalogModuleKeySchema,
    sourceKey: SourceKeySchema,
    title: z.string().trim().min(1).max(120),
    requiredReadPermission: PermissionCodeSchema,
    factSchema: ModuleAnalyticsFactSchemaV1Schema,
    ownerScopePolicy: ModuleAnalyticsOwnerScopePolicyV1Schema,
    dataClassification: ModuleAnalyticsDataClassificationV1Schema,
    dimensions: z.array(ModuleAnalyticsDimensionV1Schema).min(1).max(24),
    measures: z.array(ModuleAnalyticsMeasureV1Schema).min(1).max(32),
    defaultViews: z.array(ModuleAnalyticsDefaultViewV1Schema).min(1).max(8),
    freshnessTargetSeconds: z.number().int().min(60).max(86_400),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.ownerScopePolicy === 'UNIT_REQUIRED' && !value.factSchema.ownerUnitIdField) {
      context.addIssue({
        code: 'custom',
        message: 'UNIT_REQUIRED sources must declare factSchema.ownerUnitIdField.',
        path: ['factSchema', 'ownerUnitIdField'],
      });
    }
    if (value.ownerScopePolicy === 'PLACE_SCOPED' && !value.factSchema.ownerPlaceIdField) {
      context.addIssue({
        code: 'custom',
        message: 'PLACE_SCOPED sources must declare factSchema.ownerPlaceIdField.',
        path: ['factSchema', 'ownerPlaceIdField'],
      });
    }
    const measureKeys = new Set(value.measures.map((measure) => measure.key));
    const dimensionKeys = new Set(value.dimensions.map((dimension) => dimension.key));
    for (const view of value.defaultViews) {
      for (const key of view.kpiMeasureKeys) {
        if (!measureKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            message: `defaultViews reference unknown measure ${key}.`,
            path: ['defaultViews'],
          });
        }
      }
      if (!measureKeys.has(view.trendMeasureKey)) {
        context.addIssue({
          code: 'custom',
          message: `defaultViews.trendMeasureKey ${view.trendMeasureKey} is not declared in measures.`,
          path: ['defaultViews'],
        });
      }
      if (!dimensionKeys.has(view.breakdownDimensionKey)) {
        context.addIssue({
          code: 'custom',
          message: `defaultViews.breakdownDimensionKey ${view.breakdownDimensionKey} is not declared in dimensions.`,
          path: ['defaultViews'],
        });
      }
    }
  });

export type ModuleAnalyticsSourceContractV1 = z.infer<typeof ModuleAnalyticsSourceContractV1Schema>;

export const ModuleAnalyticsSourceCatalogV1Schema = z
  .array(ModuleAnalyticsSourceContractV1Schema)
  .superRefine((entries, context) => {
    const sourceKeys = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (sourceKeys.has(entry.sourceKey)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate sourceKey ${entry.sourceKey}.`,
          path: [index, 'sourceKey'],
        });
      }
      sourceKeys.add(entry.sourceKey);
    }
  });

export type ModuleAnalyticsSourceCatalogV1 = z.infer<typeof ModuleAnalyticsSourceCatalogV1Schema>;

/** Maps legacy `module_source_key` values in analytics DB rows to catalogue entitlement keys (migration backfill). */
export const MODULE_ANALYTICS_LEGACY_SOURCE_ENTITLEMENT_MAP: Readonly<Record<string, string>> = {
  'cmms:downtime': 'asset-maintenance',
  'workforce:positions': 'gigaops',
};

/** Stable contract sourceKey → legacy `module_source_key` stored before WI-OI-131 registration. */
export const MODULE_ANALYTICS_CONTRACT_TO_INBOX_SOURCE_KEY: Readonly<Record<string, string>> = {
  'cmms-downtime': 'cmms:downtime',
  'workforce-positions': 'workforce:positions',
};

export function inboxModuleSourceKeyForContract(sourceKey: string): string {
  return MODULE_ANALYTICS_CONTRACT_TO_INBOX_SOURCE_KEY[sourceKey] ?? sourceKey;
}

export function parseModuleAnalyticsSourceContractV1(input: unknown): ModuleAnalyticsSourceContractV1 {
  return ModuleAnalyticsSourceContractV1Schema.parse(input);
}

export function parseModuleAnalyticsSourceCatalogV1(input: unknown): ModuleAnalyticsSourceCatalogV1 {
  return ModuleAnalyticsSourceCatalogV1Schema.parse(input);
}

export function catalogModuleKeyForLegacySourceKey(sourceKey: string): string | undefined {
  return MODULE_ANALYTICS_LEGACY_SOURCE_ENTITLEMENT_MAP[sourceKey];
}
