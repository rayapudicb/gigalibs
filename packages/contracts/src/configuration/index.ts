import { z } from 'zod';
import { GovernedCatalogueDefinitionSchema } from './catalogue.js';

// The accepted Configuration Studio performance profile exercises 250 fields.
// Keep one shared hard ceiling so API parsing and surface registration cannot
// silently drift below (or expand beyond) that reviewed resource envelope.
export const CONFIGURATION_MAX_FIELDS = 250;

export const ConfigurationKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Use lowercase kebab-case');

export const ConfigurationFieldTypeSchema = z.enum([
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
]);

export const ConfigurationCoreFieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/,
    'Use a stable module-owned field key or dotted field path',
  );

export const ConfigurationComponentKeySchema = z.enum([
  'text-input',
  'textarea',
  'number-input',
  'checkbox',
  'date-input',
  'datetime-input',
  'select',
  'multi-select',
]);

export const ConfigurationCoreFieldSchema = z
  .object({
    key: ConfigurationCoreFieldKeySchema,
    label: z.string().trim().min(1).max(160),
    type: ConfigurationFieldTypeSchema,
    required: z.boolean(),
    readOnly: z.boolean(),
    classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']),
    lockReason: z.string().trim().min(3).max(500),
    allowedPresentationOverrides: z.array(z.enum(['LABEL', 'HELP_TEXT', 'PLACEMENT'])).max(3),
  })
  .strict();

export const ConfigurationExtensionSlotSchema = z
  .object({
    key: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    allowedFieldTypes: z.array(ConfigurationFieldTypeSchema).min(1).max(13),
    maximumFields: z.number().int().min(1).max(CONFIGURATION_MAX_FIELDS),
  })
  .strict();

export const ConfigurationSurfaceRegistrationSchema = z
  .object({
    registrationKey: ConfigurationKeySchema,
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    route: z.string().startsWith('/').max(300),
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    ownership: z.enum(['MODULE_EXTENSION', 'TENANT_APPLICATION']),
    authoringEnabled: z.boolean(),
    authoringDisabledReason: z.string().trim().min(3).max(500).optional(),
    entityKeyEditable: z.boolean(),
    surfaceKeyEditable: z.boolean(),
    modes: z
      .array(z.enum(['CREATE', 'EDIT', 'READ', 'LIST']))
      .min(1)
      .max(4),
    coreFields: z.array(ConfigurationCoreFieldSchema).max(200),
    extensionSlots: z.array(ConfigurationExtensionSlotSchema).min(1).max(20),
  })
  .strict();

export const ConfigurationOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(200),
  })
  .strict();

export type ConfigurationOption = z.infer<typeof ConfigurationOptionSchema>;

export const ConfigurationPermissionSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z][a-z0-9-]*:(?:\*|[a-z][a-z0-9-]*)$/, 'Use a registered resource:action permission');

export const ConfigurationConditionOperatorSchema = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'IN',
  'CONTAINS',
]);

export type ConfigurationCondition =
  | {
      kind: 'PREDICATE';
      fieldKey: string;
      operator: z.infer<typeof ConfigurationConditionOperatorSchema>;
      value?: string | number | boolean | null | Array<string | number | boolean> | undefined;
    }
  | {
      kind: 'GROUP';
      combinator: 'ALL' | 'ANY';
      conditions: ConfigurationCondition[];
    };

const ConfigurationConditionValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string().max(500), z.number().finite(), z.boolean()])).max(200),
]);

export const ConfigurationConditionSchema: z.ZodType<ConfigurationCondition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('PREDICATE'),
        fieldKey: ConfigurationKeySchema,
        operator: ConfigurationConditionOperatorSchema,
        value: ConfigurationConditionValueSchema.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('GROUP'),
        combinator: z.enum(['ALL', 'ANY']),
        conditions: z.array(ConfigurationConditionSchema).min(1).max(20),
      })
      .strict(),
  ]),
);

export const ConfigurationFieldSchema = z
  .object({
    key: ConfigurationKeySchema,
    label: z.string().trim().min(1).max(160),
    helpText: z.string().trim().max(500).optional(),
    type: ConfigurationFieldTypeSchema,
    component: ConfigurationComponentKeySchema,
    required: z.boolean().default(false),
    readOnly: z.boolean().default(false),
    classification: z
      .enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
      .default('INTERNAL'),
    readPermission: ConfigurationPermissionSchema.optional(),
    writePermission: ConfigurationPermissionSchema.optional(),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    minLength: z.number().int().min(0).max(10_000).optional(),
    maxLength: z.number().int().min(1).max(10_000).optional(),
    patternKey: ConfigurationKeySchema.optional(),
    options: z.array(ConfigurationOptionSchema).max(200).optional(),
    defaultValue: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(),
    visibleWhen: ConfigurationConditionSchema.optional(),
    requiredWhen: ConfigurationConditionSchema.optional(),
  })
  .strict();

export const ConfigurationSectionSchema = z
  .object({
    key: ConfigurationKeySchema,
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    columns: z.number().int().min(1).max(3).default(1),
    fieldKeys: z.array(ConfigurationKeySchema).min(1).max(100),
  })
  .strict();

export const ConfigurationDefinitionSchema = z
  .object({
    contractVersion: z.literal('1.0'),
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    mode: z.enum(['CREATE', 'EDIT', 'READ', 'LIST']),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    fields: z.array(ConfigurationFieldSchema).max(CONFIGURATION_MAX_FIELDS),
    sections: z.array(ConfigurationSectionSchema).max(50),
    listView: z
      .object({
        columnKeys: z.array(ConfigurationKeySchema).min(1).max(20),
        defaultSortKey: ConfigurationKeySchema.optional(),
        defaultSortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
        searchableFieldKeys: z.array(ConfigurationKeySchema).max(20).optional(),
        quickFilters: z
          .array(
            z
              .object({
                label: z.string().trim().min(1).max(80),
                fieldKey: ConfigurationKeySchema,
                operator: ConfigurationConditionOperatorSchema,
                value: z
                  .union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])
                  .optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** A change set carries either a form-surface definition or a governed catalogue (WI-OI-064c). */
export const ConfigurationChangeSetDefinitionSchema = z.union([
  ConfigurationDefinitionSchema,
  GovernedCatalogueDefinitionSchema,
]);
export type ConfigurationChangeSetDefinition = z.infer<typeof ConfigurationChangeSetDefinitionSchema>;

export const CreateConfigurationChangeSetSchema = z
  .object({
    definition: ConfigurationChangeSetDefinitionSchema,
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const UpdateConfigurationChangeSetSchema = z
  .object({
    definition: ConfigurationChangeSetDefinitionSchema,
    reason: z.string().trim().min(3).max(500),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const ConfigurationReasonSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const ActivateConfigurationSchema = z
  .object({
    publishedVersionId: z.string().min(1).max(200),
    environmentKey: ConfigurationKeySchema,
    cohortKey: ConfigurationKeySchema,
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const ConfigurationRuntimeQuerySchema = z
  .object({
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    environmentKey: ConfigurationKeySchema.optional(),
    cohortKey: ConfigurationKeySchema.optional(),
  })
  .strict();

export const ConfigurationRuntimeCurrentQuerySchema = z
  .object({
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
  })
  .strict();

export const ConfigurationRuntimePreviewQuerySchema = z
  .object({
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    environmentKey: ConfigurationKeySchema,
    cohortKey: ConfigurationKeySchema,
  })
  .strict();

export const ModuleAdapterCapabilityV1Schema = z.enum([
  'SURFACE_DISCOVERY',
  'RUNTIME_MANIFEST',
  'EXTENSION_VALUE_READ',
  'EXTENSION_VALUE_WRITE',
  'ADMINISTRATIVE_PREVIEW',
]);

export const ModuleAdapterStorageStrategyV1Schema = z.enum(['CONTROL_PLANE_EXTENSION_VALUES']);

export const ModuleAdapterCompatibilityV1Schema = z
  .object({
    descriptorVersion: z.literal('1.0'),
    manifestContractVersion: z.literal('1.0'),
    minimumRuntimeVersion: z.literal('1.0'),
  })
  .strict();

export const ModuleAdapterLimitsV1Schema = z
  .object({
    maximumFields: z.number().int().min(1).max(CONFIGURATION_MAX_FIELDS),
    maximumExtensionSlots: z.number().int().min(1).max(20),
    maximumFilterDepth: z.number().int().min(1).max(10),
    maximumFilterPredicates: z.number().int().min(1).max(100),
  })
  .strict();

export const SafeFilterContractDescriptorV1Schema = z
  .object({
    enabled: z.boolean(),
    operators: z.array(ConfigurationConditionOperatorSchema).max(10),
    maximumDepth: z.number().int().min(1).max(10),
    maximumPredicates: z.number().int().min(1).max(100),
  })
  .strict();

export const ModuleAdapterPermissionMapV1Schema = z
  .object({
    discover: ConfigurationPermissionSchema,
    runtimeRead: ConfigurationPermissionSchema,
    extensionRead: ConfigurationPermissionSchema,
    extensionWrite: ConfigurationPermissionSchema,
    administrativePreview: z.tuple([ConfigurationPermissionSchema, ConfigurationPermissionSchema]),
  })
  .strict();

export const ModuleAdapterDescriptorV1Schema = z
  .object({
    contractVersion: z.literal('1.0'),
    adapterKey: ConfigurationKeySchema,
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    entitlementModuleKey: ConfigurationKeySchema,
    capabilities: z.array(ModuleAdapterCapabilityV1Schema).min(1).max(5),
    storageStrategy: ModuleAdapterStorageStrategyV1Schema,
    compatibility: ModuleAdapterCompatibilityV1Schema,
    limits: ModuleAdapterLimitsV1Schema,
    permissions: ModuleAdapterPermissionMapV1Schema,
    audit: z
      .object({
        extensionMutationAudited: z.literal(true),
        previewEventType: z.literal('configuration.runtime.previewed.v1'),
      })
      .strict(),
    filterContract: SafeFilterContractDescriptorV1Schema,
    surface: ConfigurationSurfaceRegistrationSchema,
  })
  .strict();

export const ConfigurationRuntimeScopeV1Schema = z
  .object({
    contractVersion: z.literal('1.0'),
    environmentKey: ConfigurationKeySchema,
    cohortKey: ConfigurationKeySchema,
    policyKey: z.literal('ALL_ENTITLED_USERS_V1'),
    entitlementModuleKey: ConfigurationKeySchema,
    resolutionSource: z.literal('SERVER_POLICY'),
  })
  .strict();

export const ConfigurationRuntimeErrorCodeSchema = z.enum([
  'CONFIGURATION_ADAPTER_NOT_FOUND',
  'CONFIGURATION_ADAPTER_INCOMPATIBLE',
  'CONFIGURATION_RUNTIME_SCOPE_MISSING',
  'CONFIGURATION_RUNTIME_SCOPE_DENIED',
  'CONFIGURATION_MANIFEST_UNAVAILABLE',
]);

export const ConfigurationRuntimeErrorResponseSchema = z
  .object({
    contractVersion: z.literal('1.0'),
    code: ConfigurationRuntimeErrorCodeSchema,
    message: z.string().trim().min(1).max(240),
    retryable: z.boolean(),
  })
  .strict();

export const ConfigurationExtensionValuesSchema = z
  .object({
    publishedVersionId: z.string().min(1).max(200),
    expectedVersion: z.number().int().nonnegative(),
    values: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const CreateConfigurationRecordSchema = z
  .object({
    publishedVersionId: z.string().min(1).max(200),
    values: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const UpdateConfigurationRecordSchema = z
  .object({
    publishedVersionId: z.string().min(1).max(200),
    expectedVersion: z.number().int().positive(),
    values: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const DeleteConfigurationRecordSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const ExportConfigurationPackageSchema = z
  .object({
    publishedVersionIds: z.array(z.string().min(1).max(200)).min(1).max(100),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const ConfigurationPackagePayloadSchema = z
  .object({
    formatVersion: z.literal('gigalibs.configuration-package.v1'),
    packageId: z.string().uuid(),
    exportedAt: z.string().datetime({ offset: true }),
    sourceTenantId: z.string().min(1).max(200),
    definitions: z
      .array(
        z
          .object({
            sourcePublishedVersionId: z.string().min(1).max(200),
            sourceSequence: z.number().int().positive(),
            definition: ConfigurationDefinitionSchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const ConfigurationPackageEnvelopeSchema = z
  .object({
    payload: ConfigurationPackagePayloadSchema,
    signature: z
      .object({
        algorithm: z.literal('Ed25519'),
        keyId: z.string().min(1).max(200),
        publicKeyBase64: z.string().min(40).max(1000),
        payloadSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        valueBase64: z.string().min(40).max(1000),
      })
      .strict(),
  })
  .strict();

export const ImportConfigurationPackageSchema = z
  .object({
    package: ConfigurationPackageEnvelopeSchema,
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const ConfigurationImpactChangeSchema = z
  .object({
    fieldKey: ConfigurationKeySchema,
    kind: z.enum([
      'FIELD_ADDED',
      'FIELD_REMOVED',
      'TYPE_CHANGED',
      'REQUIRED_ADDED',
      'REQUIRED_REMOVED',
      'OPTIONS_REMOVED',
      'CONSTRAINT_TIGHTENED',
      'CONSTRAINT_RELAXED',
      'PERMISSION_REDUCED',
      'PERMISSION_BROADENED',
      'PROJECTION_CHANGED',
    ]),
    severity: z.enum(['SAFE', 'CONDITIONAL', 'BREAKING']),
    message: z.string().min(1).max(500),
  })
  .strict();

export const ConfigurationImpactReportSchema = z
  .object({
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    baselinePublishedVersionId: z.string().nullable(),
    targetPublishedVersionId: z.string().nullable(),
    targetChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    classification: z.enum(['COMPATIBLE', 'CONDITIONAL', 'BREAKING']),
    changes: z.array(ConfigurationImpactChangeSchema).max(1000),
    scanned: z
      .object({
        configurationRecords: z.number().int().nonnegative(),
        extensionValues: z.number().int().nonnegative(),
      })
      .strict(),
    incompatible: z
      .object({
        configurationRecords: z.number().int().nonnegative(),
        extensionValues: z.number().int().nonnegative(),
        samples: z
          .array(
            z
              .object({
                recordType: z.enum(['CONFIGURATION_RECORD', 'EXTENSION_VALUE']),
                recordId: z.string().min(1),
                fieldKeys: z.array(z.string()).max(200),
              })
              .strict(),
          )
          .max(20),
      })
      .strict(),
    activationAllowed: z.boolean(),
  })
  .strict();

export const ListApplicationRecordsQuerySchema = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    sortKey: z.string().max(80).optional(),
    sortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
    search: z.string().trim().max(200).optional(),
    filterKey: z.string().max(80).optional(),
    filterValue: z.string().max(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------
export const CreateConfigurationTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    values: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const UpdateConfigurationTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    values: z.record(z.string(), z.unknown()).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const DuplicateConfigurationTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

// ---------------------------------------------------------------------------
// Saved filters
// ---------------------------------------------------------------------------
export const CreateSavedFilterSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    filterKey: z.string().max(80).optional(),
    filterValue: z.string().max(500).optional(),
    search: z.string().trim().max(200).optional(),
    sortKey: z.enum(['updated-at', 'created-at']).optional(),
    sortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Stable v1 response contracts
// ---------------------------------------------------------------------------

const ConfigurationResponseIdSchema = z.string().min(1).max(200);
const ConfigurationChecksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ConfigurationJsonObjectSchema = z.record(z.string(), z.unknown());
const ConfigurationResponseDateSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

export const ConfigurationSurfaceResponseSchema = ConfigurationSurfaceRegistrationSchema.extend({
  versionSequence: z.number().int().positive().optional(),
}).strict();

export const ConfigurationChangeSetResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    status: z.enum(['DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED']),
    definition: ConfigurationChangeSetDefinitionSchema,
    compiledManifest: ConfigurationJsonObjectSchema.nullable(),
    checksum: ConfigurationChecksumSchema.nullable(),
    findings: z.array(z.unknown()).max(1000),
    compatibility: z.enum(['COMPATIBLE', 'CONDITIONAL', 'BREAKING']).nullable(),
    reason: z.string().min(3).max(500),
    version: z.number().int().positive(),
    createdById: ConfigurationResponseIdSchema,
    submittedAt: ConfigurationResponseDateSchema.nullable(),
    approvedById: ConfigurationResponseIdSchema.nullable(),
    approvedAt: ConfigurationResponseDateSchema.nullable(),
    rejectedById: ConfigurationResponseIdSchema.nullable(),
    rejectedAt: ConfigurationResponseDateSchema.nullable(),
    publishedAt: ConfigurationResponseDateSchema.nullable(),
    createdAt: ConfigurationResponseDateSchema,
    updatedAt: ConfigurationResponseDateSchema,
  })
  .strict();

export const ConfigurationPublishedVersionResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    changeSetId: ConfigurationResponseIdSchema,
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    sequence: z.number().int().positive(),
    manifest: ConfigurationJsonObjectSchema,
    checksum: ConfigurationChecksumSchema,
    compilerVersion: z.string().min(1).max(100),
    publishedById: ConfigurationResponseIdSchema,
    publishedAt: ConfigurationResponseDateSchema,
  })
  .strict();

export const ConfigurationActivationResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    publishedVersionId: ConfigurationResponseIdSchema,
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    environmentKey: ConfigurationKeySchema,
    cohortKey: ConfigurationKeySchema,
    status: z.enum(['ACTIVE', 'INACTIVE']),
    reason: z.string().min(3).max(500),
    activatedById: ConfigurationResponseIdSchema,
    activatedAt: ConfigurationResponseDateSchema,
    deactivatedAt: ConfigurationResponseDateSchema.nullable(),
  })
  .strict();

export const ConfigurationActivationListItemResponseSchema =
  ConfigurationActivationResponseSchema.extend({
    publishedVersion: z
      .object({
        checksum: ConfigurationChecksumSchema,
        sequence: z.number().int().positive(),
      })
      .strict(),
  }).strict();

export const ConfigurationRuntimeManifestResponseSchema = z
  .object({
    activationId: ConfigurationResponseIdSchema,
    publishedVersionId: ConfigurationResponseIdSchema,
    activatedAt: ConfigurationResponseDateSchema,
    manifest: ConfigurationJsonObjectSchema,
    checksum: ConfigurationChecksumSchema,
  })
  .strict();

export const ConfigurationRuntimeManifestCurrentResponseSchema =
  ConfigurationRuntimeManifestResponseSchema.extend({
    scope: ConfigurationRuntimeScopeV1Schema,
    adapter: z
      .object({
        adapterKey: ConfigurationKeySchema,
        descriptorVersion: z.literal('1.0'),
      })
      .strict(),
  }).strict();

export const ConfigurationExtensionValueResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    ownerType: ConfigurationKeySchema,
    ownerId: ConfigurationResponseIdSchema,
    publishedVersionId: ConfigurationResponseIdSchema,
    manifestChecksum: ConfigurationChecksumSchema,
    values: ConfigurationJsonObjectSchema,
    valuesChecksum: ConfigurationChecksumSchema,
    version: z.number().int().positive(),
    createdById: ConfigurationResponseIdSchema,
    updatedById: ConfigurationResponseIdSchema,
    createdAt: ConfigurationResponseDateSchema,
    updatedAt: ConfigurationResponseDateSchema,
  })
  .strict();

export const ConfigurationRuntimeApplicationResponseSchema = z
  .object({
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    activationId: ConfigurationResponseIdSchema,
    publishedVersionId: ConfigurationResponseIdSchema,
    checksum: ConfigurationChecksumSchema,
    sequence: z.number().int().positive(),
    manifest: ConfigurationJsonObjectSchema,
  })
  .strict();

export const ConfigurationRecordMutationResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    entityKey: ConfigurationKeySchema,
    publishedVersionId: ConfigurationResponseIdSchema,
    manifestChecksum: ConfigurationChecksumSchema,
    values: ConfigurationJsonObjectSchema,
    valuesChecksum: ConfigurationChecksumSchema,
    version: z.number().int().positive(),
    createdById: ConfigurationResponseIdSchema,
    updatedById: ConfigurationResponseIdSchema,
    createdAt: ConfigurationResponseDateSchema,
    updatedAt: ConfigurationResponseDateSchema,
    deletedAt: ConfigurationResponseDateSchema.nullable(),
  })
  .strict();

export const ConfigurationRecordListItemResponseSchema =
  ConfigurationRecordMutationResponseSchema.omit({ valuesChecksum: true, deletedAt: true })
    .extend({ columns: ConfigurationJsonObjectSchema })
    .strict();

export const ConfigurationRecordDetailResponseSchema =
  ConfigurationRecordMutationResponseSchema.omit({ valuesChecksum: true, deletedAt: true })
    .extend({
      manifest: ConfigurationJsonObjectSchema,
      stale: z.boolean(),
    })
    .strict();

export const ConfigurationRecordListResponseSchema = z
  .object({
    records: z.array(ConfigurationRecordListItemResponseSchema).max(200),
    manifest: ConfigurationJsonObjectSchema,
    columnKeys: z.array(ConfigurationKeySchema).max(20),
    nextCursor: ConfigurationResponseIdSchema.nullable(),
  })
  .strict();

export const ConfigurationTemplateResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    entityKey: ConfigurationKeySchema,
    name: z.string().min(1).max(160),
    description: z.string().max(1000).nullable(),
    publishedVersionId: ConfigurationResponseIdSchema,
    manifestChecksum: ConfigurationChecksumSchema,
    values: ConfigurationJsonObjectSchema,
    valuesChecksum: ConfigurationChecksumSchema,
    sourceTemplateId: ConfigurationResponseIdSchema.nullable(),
    version: z.number().int().positive(),
    createdById: ConfigurationResponseIdSchema,
    updatedById: ConfigurationResponseIdSchema,
    createdAt: ConfigurationResponseDateSchema,
    updatedAt: ConfigurationResponseDateSchema,
    stale: z.boolean().optional(),
  })
  .strict();

export const ConfigurationTemplateListResponseSchema = z
  .object({
    templates: z.array(ConfigurationTemplateResponseSchema).max(200),
    manifest: ConfigurationJsonObjectSchema,
  })
  .strict();

export const ConfigurationTemplateUpdateResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    entityKey: ConfigurationKeySchema,
    version: z.number().int().positive(),
    updatedAt: ConfigurationResponseDateSchema,
  })
  .strict();

export const ConfigurationDeletedResourceResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    deletedAt: ConfigurationResponseDateSchema,
  })
  .strict();

export const ConfigurationSavedFilterResponseSchema = z
  .object({
    id: ConfigurationResponseIdSchema,
    tenantId: ConfigurationResponseIdSchema,
    entityKey: ConfigurationKeySchema,
    name: z.string().min(1).max(120),
    filterKey: z.string().max(80).nullable(),
    filterValue: z.string().max(500).nullable(),
    search: z.string().max(200).nullable(),
    sortKey: z.enum(['updated-at', 'created-at']).nullable(),
    sortDirection: z.enum(['ASC', 'DESC']),
    createdById: ConfigurationResponseIdSchema,
    createdAt: ConfigurationResponseDateSchema,
    updatedAt: ConfigurationResponseDateSchema,
  })
  .strict();

export const ConfigurationDeletedSavedFilterResponseSchema = z
  .object({ id: ConfigurationResponseIdSchema, deleted: z.literal(true) })
  .strict();

export const ConfigurationPackageImportResponseSchema = z
  .object({
    packageId: z.string().uuid(),
    importedChangeSets: z.array(ConfigurationChangeSetResponseSchema).min(1).max(100),
  })
  .strict();

export const ConfigurationSurfaceListResponseSchema = z
  .array(ConfigurationSurfaceResponseSchema)
  .max(500);
export const ConfigurationChangeSetListResponseSchema = z
  .array(ConfigurationChangeSetResponseSchema)
  .max(100);
export const ConfigurationPublishedVersionListResponseSchema = z
  .array(ConfigurationPublishedVersionResponseSchema)
  .max(100);
export const ConfigurationActivationListResponseSchema = z
  .array(ConfigurationActivationListItemResponseSchema)
  .max(100);
export const ConfigurationRuntimeApplicationListResponseSchema = z
  .array(ConfigurationRuntimeApplicationResponseSchema)
  .max(500);
export const ConfigurationSavedFilterListResponseSchema = z
  .array(ConfigurationSavedFilterResponseSchema)
  .max(200);

export type ConfigurationDefinition = z.infer<typeof ConfigurationDefinitionSchema>;
export type ConfigurationField = z.infer<typeof ConfigurationFieldSchema>;
export type ConfigurationCoreField = z.infer<typeof ConfigurationCoreFieldSchema>;
export type ConfigurationExtensionSlot = z.infer<typeof ConfigurationExtensionSlotSchema>;
export type ConfigurationSurfaceRegistration = z.infer<
  typeof ConfigurationSurfaceRegistrationSchema
>;
export type CreateConfigurationChangeSetDto = z.infer<typeof CreateConfigurationChangeSetSchema>;
export type UpdateConfigurationChangeSetDto = z.infer<typeof UpdateConfigurationChangeSetSchema>;
export type ConfigurationReasonDto = z.infer<typeof ConfigurationReasonSchema>;
export type ActivateConfigurationDto = z.infer<typeof ActivateConfigurationSchema>;
export type ConfigurationRuntimeQuery = z.infer<typeof ConfigurationRuntimeQuerySchema>;
export type ConfigurationRuntimeCurrentQuery = z.infer<
  typeof ConfigurationRuntimeCurrentQuerySchema
>;
export type ConfigurationRuntimePreviewQuery = z.infer<
  typeof ConfigurationRuntimePreviewQuerySchema
>;
export type ModuleAdapterDescriptorV1 = z.infer<typeof ModuleAdapterDescriptorV1Schema>;
export type ConfigurationRuntimeScopeV1 = z.infer<typeof ConfigurationRuntimeScopeV1Schema>;
export type ConfigurationRuntimeErrorCode = z.infer<typeof ConfigurationRuntimeErrorCodeSchema>;
export type ConfigurationRuntimeErrorResponse = z.infer<
  typeof ConfigurationRuntimeErrorResponseSchema
>;
export type ConfigurationExtensionValuesDto = z.infer<typeof ConfigurationExtensionValuesSchema>;
export type CreateConfigurationRecordDto = z.infer<typeof CreateConfigurationRecordSchema>;
export type UpdateConfigurationRecordDto = z.infer<typeof UpdateConfigurationRecordSchema>;
export type DeleteConfigurationRecordDto = z.infer<typeof DeleteConfigurationRecordSchema>;
export type ExportConfigurationPackageDto = z.infer<typeof ExportConfigurationPackageSchema>;
export type ConfigurationPackageEnvelope = z.infer<typeof ConfigurationPackageEnvelopeSchema>;
export type ImportConfigurationPackageDto = z.infer<typeof ImportConfigurationPackageSchema>;
export type ConfigurationImpactChange = z.infer<typeof ConfigurationImpactChangeSchema>;
export type ConfigurationImpactReport = z.infer<typeof ConfigurationImpactReportSchema>;
export type ListApplicationRecordsQuery = z.infer<typeof ListApplicationRecordsQuerySchema>;
export type CreateConfigurationTemplateDto = z.infer<typeof CreateConfigurationTemplateSchema>;
export type UpdateConfigurationTemplateDto = z.infer<typeof UpdateConfigurationTemplateSchema>;
export type DuplicateConfigurationTemplateDto = z.infer<
  typeof DuplicateConfigurationTemplateSchema
>;
export type CreateSavedFilterDto = z.infer<typeof CreateSavedFilterSchema>;
export type ConfigurationChangeSetResponse = z.infer<typeof ConfigurationChangeSetResponseSchema>;
export type ConfigurationPublishedVersionResponse = z.infer<
  typeof ConfigurationPublishedVersionResponseSchema
>;
export type ConfigurationActivationResponse = z.infer<typeof ConfigurationActivationResponseSchema>;
export type ConfigurationExtensionValueResponse = z.infer<
  typeof ConfigurationExtensionValueResponseSchema
>;
export type ConfigurationRecordMutationResponse = z.infer<
  typeof ConfigurationRecordMutationResponseSchema
>;
export type ConfigurationTemplateResponse = z.infer<typeof ConfigurationTemplateResponseSchema>;
export type ConfigurationSavedFilterResponse = z.infer<
  typeof ConfigurationSavedFilterResponseSchema
>;

export * from './catalogue.js';
