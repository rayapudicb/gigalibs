import { z } from 'zod';

const CONFIGURATION_MAX_FIELDS = 250;

const ConfigurationKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Use lowercase kebab-case');

// ─── 1. Entity & Ownership ───────────────────────────────────────────────────

export const DictionaryEntityKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(
    /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/,
    'Use namespaced lowercase kebab/dot notation, e.g. platform.tenant-profile',
  );

export const DictionaryEntityOwnershipSchema = z.enum([
  'MODULE_CORE',
  'MODULE_CONTRIBUTION',
  'TENANT_EXTENSION',
]);
export type DictionaryEntityOwnership = z.infer<typeof DictionaryEntityOwnershipSchema>;

export const DictionaryEntityV1Schema = z
  .object({
    entityKey: DictionaryEntityKeySchema,
    moduleKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    ownership: DictionaryEntityOwnershipSchema,
    primaryKeyField: z.string().trim().min(1).max(64).default('id'),
    isVersioned: z.boolean().default(true),
    isAuditLogged: z.boolean().default(true),
    isSoftDeletable: z.boolean().default(false),
  })
  .strict();
export type DictionaryEntityV1 = z.infer<typeof DictionaryEntityV1Schema>;

// ─── 2. Fields & Data Classification ─────────────────────────────────────────

export const DictionaryFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'CURRENCY',
  'SELECT',
  'MULTI_SELECT',
  'REFERENCE',
  'COMPOSITE',
]);
export type DictionaryFieldType = z.infer<typeof DictionaryFieldTypeSchema>;

export const DictionaryDataClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);
export type DictionaryDataClassification = z.infer<typeof DictionaryDataClassificationSchema>;

export const DictionaryFieldV1Schema = z
  .object({
    fieldKey: ConfigurationKeySchema,
    entityKey: DictionaryEntityKeySchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    type: DictionaryFieldTypeSchema,
    required: z.boolean().default(false),
    readOnly: z.boolean().default(false),
    isSystemLocked: z.boolean().default(false),
    classification: DictionaryDataClassificationSchema.default('INTERNAL'),
    defaultValue: z.unknown().optional(),
    referenceKey: ConfigurationKeySchema.optional(),
    validationRuleKeys: z.array(ConfigurationKeySchema).max(20).optional(),
    helpText: z.string().trim().max(1000).optional(),
    maskOnDisplay: z.boolean().default(false),
    readPermission: z.string().trim().max(100).optional(),
    writePermission: z.string().trim().max(100).optional(),
    /**
     * WI-OI-120f (F0.1): decimal places of an exact NUMBER or CURRENCY field. Such a value travels as a decimal
     * string (for example "12.50"), never as a binary float.
     */
    scale: z.number().int().min(0).max(8).optional(),
  })
  .strict();
export type DictionaryFieldV1 = z.infer<typeof DictionaryFieldV1Schema>;

// ─── 3. Relationships & References ───────────────────────────────────────────

export const DictionaryRelationshipTypeSchema = z.enum([
  'ONE_TO_ONE',
  'ONE_TO_MANY',
  'MANY_TO_ONE',
  'MANY_TO_MANY',
]);
export type DictionaryRelationshipType = z.infer<typeof DictionaryRelationshipTypeSchema>;

export const DictionaryRelationshipV1Schema = z
  .object({
    relationshipKey: ConfigurationKeySchema,
    sourceEntityKey: DictionaryEntityKeySchema,
    targetEntityKey: DictionaryEntityKeySchema,
    type: DictionaryRelationshipTypeSchema,
    foreignKeyField: z.string().trim().min(1).max(64),
    inverseRelationshipKey: ConfigurationKeySchema.optional(),
    cascadeDelete: z.boolean().default(false),
  })
  .strict();
export type DictionaryRelationshipV1 = z.infer<typeof DictionaryRelationshipV1Schema>;

export const DictionaryReferenceTypeSchema = z.enum([
  'TABLE_DIR',
  'TABLE_QUERY',
  'VALUE_LIST',
  'SEARCH_LOOKUP',
]);
export type DictionaryReferenceType = z.infer<typeof DictionaryReferenceTypeSchema>;

export const DictionaryReferenceOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const DictionaryReferenceV1Schema = z
  .object({
    referenceKey: ConfigurationKeySchema,
    referenceType: DictionaryReferenceTypeSchema,
    targetEntityKey: DictionaryEntityKeySchema.optional(),
    targetValueField: z.string().trim().min(1).max(64).optional(),
    targetDisplayField: z.string().trim().min(1).max(64).optional(),
    staticValues: z.array(DictionaryReferenceOptionSchema).max(200).optional(),
    resolverKey: ConfigurationKeySchema.optional(),
    /**
     * WI-OI-120 (F0.6): the published window that creates this reference's records, offered from a picker as
     * "Add new" (and "Open" for the chosen record) to a user holding `permission`. The module generator refuses a
     * window no module ships.
     */
    createWith: z
      .object({
        moduleKey: ConfigurationKeySchema,
        surfaceKey: ConfigurationKeySchema,
        permission: z.string().trim().min(1).max(120),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DictionaryReferenceV1 = z.infer<typeof DictionaryReferenceV1Schema>;

// ─── 4. Bounded Validation Safe AST ───────────────────────────────────────────

export const DictionaryValidationOperatorSchema = z.enum([
  'EQ',
  'NEQ',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'NOT_IN',
  'CONTAINS',
  'MATCHES_REGEX',
  'IS_NULL',
  'IS_NOT_NULL',
]);
export type DictionaryValidationOperator = z.infer<typeof DictionaryValidationOperatorSchema>;

export interface DictionaryValidationExpression {
  field?: string | undefined;
  operator?: DictionaryValidationOperator | undefined;
  value?: unknown;
  all?: DictionaryValidationExpression[] | undefined;
  any?: DictionaryValidationExpression[] | undefined;
  not?: DictionaryValidationExpression | undefined;
}

export const DictionaryValidationExpressionSchema: z.ZodType<DictionaryValidationExpression> = z.lazy(
  () =>
    z
      .object({
        field: z.string().trim().min(1).max(120).optional(),
        operator: DictionaryValidationOperatorSchema.optional(),
        value: z.unknown().optional(),
        all: z.array(DictionaryValidationExpressionSchema).max(10).optional(),
        any: z.array(DictionaryValidationExpressionSchema).max(10).optional(),
        not: DictionaryValidationExpressionSchema.optional(),
      })
      .strict(),
);

export const DictionaryValidationRuleV1Schema = z
  .object({
    ruleKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    errorMessage: z.string().trim().min(1).max(500),
    severity: z.enum(['ERROR', 'WARNING', 'INFO']).default('ERROR'),
    condition: DictionaryValidationExpressionSchema,
  })
  .strict();
export type DictionaryValidationRuleV1 = z.infer<typeof DictionaryValidationRuleV1Schema>;

// ─── 5. Presentation Views, Tabs & Sections ───────────────────────────────────

export const DictionarySurfaceModeSchema = z.enum(['CREATE', 'EDIT', 'READ', 'LIST']);
export type DictionarySurfaceMode = z.infer<typeof DictionarySurfaceModeSchema>;

export const DictionaryDeviceTypeSchema = z.enum(['ALL', 'DESKTOP', 'TABLET', 'MOBILE']);
export type DictionaryDeviceType = z.infer<typeof DictionaryDeviceTypeSchema>;

export const DictionaryFieldPlacementV1Schema = z
  .object({
    fieldKey: ConfigurationKeySchema,
    sectionKey: ConfigurationKeySchema.optional(),
    position: z.number().int().min(0).max(1000),
    span: z.number().int().min(1).max(12).default(12),
    componentKey: z.string().trim().min(1).max(80).default('text-input'),
    visibilityCondition: DictionaryValidationExpressionSchema.optional(),
    readOnlyCondition: DictionaryValidationExpressionSchema.optional(),
    requiredCondition: DictionaryValidationExpressionSchema.optional(),
  })
  .strict();
export type DictionaryFieldPlacementV1 = z.infer<typeof DictionaryFieldPlacementV1Schema>;

export const DictionarySectionV1Schema = z
  .object({
    sectionKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    collapsible: z.boolean().default(false),
    defaultCollapsed: z.boolean().default(false),
    position: z.number().int().min(0).max(1000),
  })
  .strict();
export type DictionarySectionV1 = z.infer<typeof DictionarySectionV1Schema>;

export const DictionaryTabV1Schema = z
  .object({
    tabKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    position: z.number().int().min(0).max(100),
    level: z.number().int().min(0).max(5).default(0),
    targetEntityKey: DictionaryEntityKeySchema,
    parentRelationshipKey: ConfigurationKeySchema.optional(),
    sections: z.array(DictionarySectionV1Schema).max(20).default([]),
    fields: z.array(DictionaryFieldPlacementV1Schema).max(CONFIGURATION_MAX_FIELDS).default([]),
    visibilityCondition: DictionaryValidationExpressionSchema.optional(),
  })
  .strict();
export type DictionaryTabV1 = z.infer<typeof DictionaryTabV1Schema>;

export const DictionaryViewV1Schema = z
  .object({
    viewKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    mode: DictionarySurfaceModeSchema,
    device: DictionaryDeviceTypeSchema.default('ALL'),
    tabs: z.array(DictionaryTabV1Schema).min(1).max(20),
    searchFields: z.array(ConfigurationKeySchema).max(10).optional(),
    filterFields: z.array(ConfigurationKeySchema).max(20).optional(),
    defaultSortField: ConfigurationKeySchema.optional(),
    defaultSortDirection: z.enum(['ASC', 'DESC']).default('ASC'),
  })
  .strict();
export type DictionaryViewV1 = z.infer<typeof DictionaryViewV1Schema>;

// ─── 6. Navigation Contributions ──────────────────────────────────────────────

export const DictionaryNavigationItemV1Schema = z
  .object({
    itemKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    icon: z.string().trim().max(64).optional(),
    route: z.string().startsWith('/').max(300),
    parentItemKey: ConfigurationKeySchema.optional(),
    position: z.number().int().min(0).max(1000),
    requiredPermissions: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    requiredModule: ConfigurationKeySchema.optional(),
    badge: z.string().trim().max(32).optional(),
  })
  .strict();
export type DictionaryNavigationItemV1 = z.infer<typeof DictionaryNavigationItemV1Schema>;

// ─── 7. Registered Actions ────────────────────────────────────────────────────

export const DictionaryActionTypeSchema = z.enum(['COMMAND', 'WORKFLOW', 'REPORT', 'NAVIGATE']);
export type DictionaryActionType = z.infer<typeof DictionaryActionTypeSchema>;

export const DictionaryActionParameterSchema = z
  .object({
    key: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    type: DictionaryFieldTypeSchema,
    required: z.boolean().default(false),
  })
  .strict();

export const DictionaryActionV1Schema = z
  .object({
    actionKey: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    icon: z.string().trim().max(64).optional(),
    type: DictionaryActionTypeSchema,
    handlerKey: z.string().trim().min(1).max(120),
    requiredPermissions: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    confirmationPrompt: z.string().trim().max(500).optional(),
    parameters: z.array(DictionaryActionParameterSchema).max(20).optional(),
    visibilityCondition: DictionaryValidationExpressionSchema.optional(),
  })
  .strict();
export type DictionaryActionV1 = z.infer<typeof DictionaryActionV1Schema>;

// ─── 8. Messages & Translations ───────────────────────────────────────────────

export const DictionaryMessageCategorySchema = z.enum([
  'LABEL',
  'HELP_TEXT',
  'ERROR',
  'CONFIRMATION',
]);
export type DictionaryMessageCategory = z.infer<typeof DictionaryMessageCategorySchema>;

export const DictionaryMessageV1Schema = z
  .object({
    messageKey: z.string().trim().min(1).max(120),
    locale: z.string().trim().min(2).max(10).regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    value: z.string().trim().min(1).max(1000),
    category: DictionaryMessageCategorySchema.default('LABEL'),
  })
  .strict();
export type DictionaryMessageV1 = z.infer<typeof DictionaryMessageV1Schema>;

// ─── 9. Package Definition & Compiled Runtime Manifest ────────────────────────

export const DictionaryPackageDefinitionV1Schema = z
  .object({
    packageKey: ConfigurationKeySchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    moduleKey: ConfigurationKeySchema,
    targetEntityKey: DictionaryEntityKeySchema,
    entities: z.array(DictionaryEntityV1Schema).max(50).default([]),
    fields: z.array(DictionaryFieldV1Schema).max(CONFIGURATION_MAX_FIELDS).default([]),
    relationships: z.array(DictionaryRelationshipV1Schema).max(50).default([]),
    references: z.array(DictionaryReferenceV1Schema).max(100).default([]),
    validationRules: z.array(DictionaryValidationRuleV1Schema).max(100).default([]),
    views: z.array(DictionaryViewV1Schema).max(50).default([]),
    navigation: z.array(DictionaryNavigationItemV1Schema).max(100).default([]),
    actions: z.array(DictionaryActionV1Schema).max(50).default([]),
    messages: z.array(DictionaryMessageV1Schema).max(1000).default([]),
  })
  .strict();
export type DictionaryPackageDefinitionV1 = z.infer<typeof DictionaryPackageDefinitionV1Schema>;

export const CompiledDictionaryManifestV1Schema = z
  .object({
    manifestVersion: z.literal(1),
    packageKey: ConfigurationKeySchema,
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    compiledAt: z.string().datetime(),
    tenantId: z.string().uuid().optional(),
    publishedVersionId: z.string().uuid().optional(),
    entities: z.array(DictionaryEntityV1Schema),
    fields: z.array(DictionaryFieldV1Schema),
    relationships: z.array(DictionaryRelationshipV1Schema),
    references: z.array(DictionaryReferenceV1Schema),
    validationRules: z.array(DictionaryValidationRuleV1Schema),
    views: z.array(DictionaryViewV1Schema),
    navigation: z.array(DictionaryNavigationItemV1Schema),
    actions: z.array(DictionaryActionV1Schema),
    messages: z.array(DictionaryMessageV1Schema),
  })
  .strict();
export type CompiledDictionaryManifestV1 = z.infer<typeof CompiledDictionaryManifestV1Schema>;

export const DictionaryChangeSetDefinitionSchema = z
  .object({
    kind: z.literal('APPLICATION_DICTIONARY'),
    contractVersion: z.literal('1.0'),
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    title: z.string().trim().min(1).max(160),
    dictionary: DictionaryPackageDefinitionV1Schema,
  })
  .strict();
export type DictionaryChangeSetDefinition = z.infer<typeof DictionaryChangeSetDefinitionSchema>;

/**
 * WI-OI-120f (F0.2): a module's own window definitions are published under a package key ending in this suffix. Only
 * the platform's baseline activation may publish such a key, so an active version with it is known to be the module
 * baseline rather than a tenant's customisation.
 */
export const MODULE_BASELINE_PACKAGE_SUFFIX = '-module-baseline';

export function isDictionaryChangeSetDefinition(
  value: unknown,
): value is DictionaryChangeSetDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    'kind' in value &&
    (value as { kind: unknown }).kind === 'APPLICATION_DICTIONARY'
  );
}

export function isDictionaryManifest(value: unknown): value is CompiledDictionaryManifestV1 {
  return (
    !!value &&
    typeof value === 'object' &&
    'manifestVersion' in value &&
    (value as { manifestVersion: unknown }).manifestVersion === 1 &&
    'entities' in value &&
    Array.isArray((value as { entities: unknown }).entities)
  );
}


// ─── 9. Executable capabilities (WI-OI-120f, F0.1) ──────────────────────────
/**
 * What the metadata window can execute. A package that uses anything else is refused at publish time instead of
 * being published and silently ignored (ADR-0033 D1; metadata investigation M-01). Raise the version whenever the
 * list changes.
 */
export const DICTIONARY_CAPABILITY_VERSION = 1;
export const DICTIONARY_EXECUTABLE_CAPABILITIES = Object.freeze({
  fieldTypes: Object.freeze([
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'INTEGER',
    'BOOLEAN',
    'DATE',
    'DATETIME',
    'EMAIL',
    'PHONE',
    'URL',
    'CURRENCY',
    'SELECT',
    'REFERENCE',
  ] as const satisfies readonly DictionaryFieldType[]),
  componentKeys: Object.freeze([
    'text-input',
    'number-input',
    'textarea',
    'select',
    'select-dropdown',
    'checkbox',
    'date-input',
    'datetime-input',
    'currency-input',
    'lookup',
  ] as const),
  /** VALUE_LIST is drawn from its static values; every other reference type needs a registered resolver. */
  referenceTypes: Object.freeze(['VALUE_LIST', 'TABLE_DIR', 'TABLE_QUERY', 'SEARCH_LOOKUP'] as const satisfies readonly DictionaryReferenceType[]),
  /** COMMAND runs a registered module command; NAVIGATE opens another window. WORKFLOW and REPORT are not executed yet. */
  actionTypes: Object.freeze(['COMMAND', 'NAVIGATE'] as const satisfies readonly DictionaryActionType[]),
  viewModes: Object.freeze(['LIST', 'READ', 'EDIT', 'CREATE'] as const satisfies readonly DictionarySurfaceMode[]),
  /** Types whose values are exact decimal strings when `scale` is set. */
  exactDecimalTypes: Object.freeze(['NUMBER', 'CURRENCY'] as const satisfies readonly DictionaryFieldType[]),
});
