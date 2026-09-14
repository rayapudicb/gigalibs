import { z } from 'zod';

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

export const ConfigurationOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(200),
  })
  .strict();

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
    fields: z.array(ConfigurationFieldSchema).max(200),
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
                  .union([
                    z.string().max(200),
                    z.number().finite(),
                    z.boolean(),
                    z.null(),
                  ])
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

export const CreateConfigurationChangeSetSchema = z
  .object({
    definition: ConfigurationDefinitionSchema,
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const UpdateConfigurationChangeSetSchema = z
  .object({
    definition: ConfigurationDefinitionSchema,
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
    environmentKey: ConfigurationKeySchema.default('local-uat'),
    cohortKey: ConfigurationKeySchema.default('all-users'),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const ConfigurationRuntimeQuerySchema = z
  .object({
    moduleKey: ConfigurationKeySchema,
    entityKey: ConfigurationKeySchema,
    surfaceKey: ConfigurationKeySchema,
    environmentKey: ConfigurationKeySchema.default('local-uat'),
    cohortKey: ConfigurationKeySchema.default('all-users'),
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
      'OPTIONS_REMOVED',
      'CONSTRAINT_TIGHTENED',
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

export type ConfigurationDefinition = z.infer<typeof ConfigurationDefinitionSchema>;
export type ConfigurationField = z.infer<typeof ConfigurationFieldSchema>;
export type CreateConfigurationChangeSetDto = z.infer<typeof CreateConfigurationChangeSetSchema>;
export type UpdateConfigurationChangeSetDto = z.infer<typeof UpdateConfigurationChangeSetSchema>;
export type ConfigurationReasonDto = z.infer<typeof ConfigurationReasonSchema>;
export type ActivateConfigurationDto = z.infer<typeof ActivateConfigurationSchema>;
export type ConfigurationRuntimeQuery = z.infer<typeof ConfigurationRuntimeQuerySchema>;
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
export type DuplicateConfigurationTemplateDto = z.infer<typeof DuplicateConfigurationTemplateSchema>;
export type CreateSavedFilterDto = z.infer<typeof CreateSavedFilterSchema>;
