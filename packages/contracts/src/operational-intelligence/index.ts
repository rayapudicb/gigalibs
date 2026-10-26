import { z } from 'zod';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const OperationalJsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(OperationalJsonValueSchema),
    z.record(z.string(), OperationalJsonValueSchema),
  ]),
);

export const OperationalJsonObjectSchema = z.record(z.string(), OperationalJsonValueSchema);

export const DataClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);

const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits, and hyphens.');

export const CreateEnvironmentSchema = z.object({
  slug: SlugSchema,
  displayName: z.string().trim().min(1).max(120),
  kind: z.enum(['DEVELOPMENT', 'TEST', 'STAGING', 'PRODUCTION', 'DEMO']),
  region: z.string().trim().min(2).max(80),
  retentionDays: z.number().int().min(1).max(3_650),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  configuration: OperationalJsonObjectSchema.optional(),
});

export const CreateCredentialReferenceSchema = z
  .object({
    environmentId: z.string().min(1).max(128),
    label: z.string().trim().min(1).max(120),
    provider: z.enum(['DEPLOYMENT_SECRET', 'EXTERNAL_VAULT']),
    reference: z.string().trim().min(1).max(512),
    authType: z.enum([
      'NONE',
      'BEARER_TOKEN',
      'API_KEY_HEADER',
      'HMAC_SHA256',
      'USERNAME_PASSWORD',
    ]),
    headerName: z.string().trim().min(1).max(128).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.provider === 'DEPLOYMENT_SECRET' &&
      !/^env:\/\/[A-Z][A-Z0-9_]*$/.test(value.reference)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Deployment secrets must use an env://VARIABLE_NAME reference.',
      });
    }
    if (
      value.provider === 'EXTERNAL_VAULT' &&
      !/^vault:\/\/[A-Za-z0-9][A-Za-z0-9/_:-]*$/.test(value.reference)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'External secrets must use a vault://path reference.',
      });
    }
    if (value.authType === 'API_KEY_HEADER' && !value.headerName) {
      context.addIssue({
        code: 'custom',
        path: ['headerName'],
        message: 'A header name is required for API key authentication.',
      });
    }
    if (value.authType !== 'API_KEY_HEADER' && value.headerName) {
      context.addIssue({
        code: 'custom',
        path: ['headerName'],
        message: 'A header name is only valid for API key authentication.',
      });
    }
  });

const HttpJsonConnectorConfigurationSchema = z
  .object({
    requestMethod: z.literal('GET').default('GET'),
    accept: z.literal('application/json'),
    sampleRecordLimit: z.number().int().min(1).max(1_000).default(100),
  })
  .strict();

const HttpCsvConnectorConfigurationSchema = z
  .object({
    requestMethod: z.literal('GET').default('GET'),
    accept: z.literal('text/csv'),
    csvDelimiter: z.string().length(1),
    sampleRecordLimit: z.number().int().min(1).max(1_000).default(100),
  })
  .strict();

const WebhookConnectorConfigurationSchema = z
  .object({
    signatureHeader: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[!#$%&'*+.^_`|~0-9a-z-]+$/)
      .max(128),
    timestampHeader: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[!#$%&'*+.^_`|~0-9a-z-]+$/)
      .max(128),
    maxSkewSeconds: z.number().int().min(1).max(3_600),
    sampleRecordLimit: z.number().int().min(1).max(1_000).default(100),
  })
  .strict()
  .refine((value) => value.signatureHeader !== value.timestampHeader, {
    message: 'Signature and timestamp headers must be different.',
    path: ['timestampHeader'],
  });

const PostgreSqlConnectorConfigurationSchema = z
  .object({
    schemaName: z.string().trim().min(1).max(63),
    tableName: z.string().trim().min(1).max(63),
    columns: z.array(z.string().trim().min(1).max(63)).min(1).max(100),
    sampleRecordLimit: z.number().int().min(1).max(1_000),
    connectionTimeoutSeconds: z.number().int().min(1).max(60),
    statementTimeoutMs: z.number().int().min(100).max(120_000),
    sslMode: z.enum(['DISABLE', 'VERIFY_FULL']),
  })
  .strict()
  .refine((value) => new Set(value.columns).size === value.columns.length, {
    message: 'PostgreSQL columns must be unique.',
    path: ['columns'],
  });

const FileUploadConnectorConfigurationSchema = z
  .object({
    acceptedContentTypes: z
      .array(z.enum(['application/json', 'text/csv']))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, 'Content types must be unique.'),
    csvDelimiter: z.string().length(1),
    sampleRecordLimit: z.number().int().min(1).max(1_000),
  })
  .strict();

const ConnectionBaseSchema = z.object({
  environmentId: z.string().min(1).max(128),
  credentialReferenceId: z.string().min(1).max(128).nullable().optional(),
  slug: SlugSchema,
  name: z.string().trim().min(1).max(160),
  mode: z.literal('READ_ONLY').default('READ_ONLY'),
});

const HttpEndpointSchema = z
  .string()
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    const endpoint = new URL(value);
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      context.addIssue({ code: 'custom', message: 'Only HTTP(S) endpoints are supported.' });
    }
    if (endpoint.username || endpoint.password || endpoint.hash) {
      context.addIssue({
        code: 'custom',
        message: 'Credentials and fragments are not permitted in connector URLs.',
      });
    }
  });

const PostgreSqlEndpointSchema = z
  .string()
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    const endpoint = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(endpoint.protocol)) {
      context.addIssue({
        code: 'custom',
        message: 'A PostgreSQL endpoint must use postgres:// or postgresql://.',
      });
    }
    if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
      context.addIssue({
        code: 'custom',
        message: 'Credentials, fragments and query parameters are not permitted in database URLs.',
      });
    }
    if (!endpoint.pathname || endpoint.pathname === '/') {
      context.addIssue({ code: 'custom', message: 'The database name is required in the endpoint.' });
    }
  });

export const CreateConnectionSchema = z.discriminatedUnion('interfaceType', [
  ConnectionBaseSchema.extend({
    interfaceType: z.literal('REST'),
    endpoint: HttpEndpointSchema,
    configuration: HttpJsonConnectorConfigurationSchema,
  }).strict(),
  ConnectionBaseSchema.extend({
    interfaceType: z.literal('CSV_HTTP'),
    endpoint: HttpEndpointSchema,
    configuration: HttpCsvConnectorConfigurationSchema,
  }).strict(),
  ConnectionBaseSchema.extend({
    interfaceType: z.literal('WEBHOOK'),
    credentialReferenceId: z.string().min(1).max(128),
    configuration: WebhookConnectorConfigurationSchema,
  }).strict(),
  ConnectionBaseSchema.extend({
    interfaceType: z.literal('POSTGRESQL'),
    credentialReferenceId: z.string().min(1).max(128),
    endpoint: PostgreSqlEndpointSchema,
    configuration: PostgreSqlConnectorConfigurationSchema,
  }).strict(),
  ConnectionBaseSchema.extend({
    interfaceType: z.literal('FILE_UPLOAD'),
    credentialReferenceId: z.null().optional(),
    configuration: FileUploadConnectorConfigurationSchema,
  }).strict(),
]);

export const CreateDataContractSchema = z.object({
  environmentId: z.string().min(1).max(128),
  connectionId: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(160),
  eventType: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+\.v[1-9][0-9]*$/),
});

export const PublishDataContractSchema = z.object({
  jsonSchema: OperationalJsonObjectSchema,
  mapping: OperationalJsonObjectSchema.default({}),
  compatibilityMode: z.enum(['BACKWARD', 'FORWARD', 'FULL', 'NONE']).default('BACKWARD'),
});

export const IngestOperationalEventSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  tenantId: z.string().trim().min(1).max(128),
  environmentId: z.string().trim().min(1).max(128),
  sourceId: z.string().trim().min(1).max(128),
  eventType: z.string().trim().min(3).max(160),
  eventVersion: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  correlationId: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(1).max(256),
  actor: z.object({
    type: z.string().trim().min(1).max(80),
    id: z.string().trim().min(1).max(128).nullable().optional(),
  }),
  entityRefs: z
    .record(
      z.string().min(1).max(80),
      z.union([z.string().max(256), z.array(z.string().max(256)).max(100)]),
    )
    .default({}),
  classification: DataClassificationSchema,
  payload: OperationalJsonObjectSchema,
});

export const WebhookOperationalEventSchema = IngestOperationalEventSchema.omit({
  tenantId: true,
  environmentId: true,
  sourceId: true,
}).strict();

export const RequestSourceFileUploadSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(
        (value) =>
          !value.includes('/') &&
          !value.includes('\\') &&
          !value.includes('\0') &&
          !/[\u0000-\u001f\u007f]/.test(value),
        'File name must not contain paths or control characters.',
      ),
    contentType: z.enum(['application/json', 'text/csv']),
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const CompleteSourceFileSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('PROFILE'),
      classification: DataClassificationSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('INGEST'),
      eventId: z.string().trim().min(1).max(128),
      eventType: z.string().trim().min(3).max(160),
      eventVersion: z.number().int().positive(),
      occurredAt: z.string().datetime({ offset: true }),
      correlationId: z.string().trim().min(1).max(128),
      idempotencyKey: z.string().trim().min(1).max(256),
      actor: z.object({
        type: z.string().trim().min(1).max(80),
        id: z.string().trim().min(1).max(128).nullable().optional(),
      }),
      entityRefs: z
        .record(
          z.string().min(1).max(80),
          z.union([z.string().max(256), z.array(z.string().max(256)).max(100)]),
        )
        .default({}),
      classification: DataClassificationSchema,
    })
    .strict(),
]);

export const CreateRetentionHoldSchema = z
  .object({
    environmentId: z.string().min(1).max(128),
    reason: z.string().trim().min(10).max(2_000),
  })
  .strict();

export const ReleaseRetentionHoldSchema = z
  .object({
    reason: z.string().trim().min(10).max(2_000),
  })
  .strict();

// WI-OI-120 (T9b): named retention classes. A class is the reusable "how long, and on what basis" that an environment
// adopts (TenantEnvironment.retentionClass) so the purge uses its period. A legal hold still overrides any class.
export const RetentionBasisSchema = z.enum(['REGULATORY', 'LEGAL', 'CONTRACTUAL', 'OPERATIONAL']);
export type RetentionBasis = z.infer<typeof RetentionBasisSchema>;

/** A stable slug a tenant (or a solution pack) references; lower-case, 2–63 chars, starts with a letter. */
export const RetentionClassKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{1,62}$/,
    'A key is lower-case letters, digits and hyphens, 2–63 characters, starting with a letter.',
  );

/** At most 100 years — the same ceiling the migration's CHECK enforces, so the API refuses before the database does. */
export const RETENTION_DAYS_MAX = 36_500;

export const CreateRetentionClassSchema = z
  .object({
    key: RetentionClassKeySchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).optional(),
    retentionDays: z.number().int().min(1).max(RETENTION_DAYS_MAX),
    basis: RetentionBasisSchema.default('OPERATIONAL'),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const UpdateRetentionClassSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    retentionDays: z.number().int().min(1).max(RETENTION_DAYS_MAX).optional(),
    basis: RetentionBasisSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Change at least one field.');

/** Point an environment at a retention class, or clear it (null) to fall back to the environment's bare period. */
export const AssignRetentionClassSchema = z
  .object({
    environmentId: z.string().min(1).max(128),
    retentionClassId: z.string().min(1).max(128).nullable(),
  })
  .strict();

/**
 * The cutoff instant for a retention period: data first seen before this is eligible to purge. Pure, so the worker and
 * its tests compute it the same way.
 */
export function retentionCutoff(retentionDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
}

/** The period that actually governs an environment: its adopted class's, or its own bare `retentionDays` when none. */
export function effectiveRetentionDays(
  environment: { readonly retentionDays: number },
  retentionClass: { readonly retentionDays: number } | null | undefined,
): number {
  return retentionClass?.retentionDays ?? environment.retentionDays;
}

/** Whether any of the environment's holds is active, which blocks every purge regardless of class period. */
export function legalHoldBlocksPurge(holds: ReadonlyArray<{ readonly status: string }>): boolean {
  return holds.some((hold) => hold.status === 'ACTIVE');
}

/**
 * Sensible starting classes a workspace (or a setup wizard) can adopt. These are data, not auto-created: a tenant picks
 * what it needs. Periods are deliberately round and conservative; a compliance owner tunes them per jurisdiction.
 */
export const RETENTION_CLASS_PRESETS: ReadonlyArray<{
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly retentionDays: number;
  readonly basis: RetentionBasis;
}> = [
  {
    key: 'operational-telemetry',
    name: 'Operational telemetry',
    description: 'Event and processing data kept only as long as operations need it.',
    retentionDays: 90,
    basis: 'OPERATIONAL',
  },
  {
    key: 'security-audit',
    name: 'Security & audit logs',
    description: 'Access and change evidence for security review.',
    retentionDays: 365,
    basis: 'REGULATORY',
  },
  {
    key: 'personal-data',
    name: 'Personal data',
    description: 'Records about identifiable people, kept no longer than the lawful basis allows.',
    retentionDays: 1_095,
    basis: 'LEGAL',
  },
  {
    key: 'contracts-and-agreements',
    name: 'Contracts & agreements',
    description: 'Signed agreements and their supporting records.',
    retentionDays: 3_650,
    basis: 'CONTRACTUAL',
  },
  {
    key: 'financial-records',
    name: 'Financial records',
    description: 'Accounting and tax records kept for the statutory period.',
    retentionDays: 2_555,
    basis: 'REGULATORY',
  },
];

export type CreateEnvironmentDto = z.infer<typeof CreateEnvironmentSchema>;
export type CreateCredentialReferenceDto = z.infer<typeof CreateCredentialReferenceSchema>;
export type CreateConnectionDto = z.infer<typeof CreateConnectionSchema>;
export type CreateDataContractDto = z.infer<typeof CreateDataContractSchema>;
export type PublishDataContractDto = z.infer<typeof PublishDataContractSchema>;
export type IngestOperationalEventDto = z.infer<typeof IngestOperationalEventSchema>;
export type WebhookOperationalEventDto = z.infer<typeof WebhookOperationalEventSchema>;
export type RequestSourceFileUploadDto = z.infer<typeof RequestSourceFileUploadSchema>;
export type CompleteSourceFileDto = z.infer<typeof CompleteSourceFileSchema>;
export type CreateRetentionHoldDto = z.infer<typeof CreateRetentionHoldSchema>;
export type ReleaseRetentionHoldDto = z.infer<typeof ReleaseRetentionHoldSchema>;
export type CreateRetentionClassDto = z.infer<typeof CreateRetentionClassSchema>;
export type UpdateRetentionClassDto = z.infer<typeof UpdateRetentionClassSchema>;
export type AssignRetentionClassDto = z.infer<typeof AssignRetentionClassSchema>;
