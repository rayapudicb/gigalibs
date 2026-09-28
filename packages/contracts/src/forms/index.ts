import { z } from 'zod';

// ─── Dual-Mode Form Engine Contracts (Phase 2 & Mobile First) ─────────────────

export const FormModeSchema = z.enum(['OPERATIONAL', 'PUBLIC', 'HYBRID']);
export type FormMode = z.infer<typeof FormModeSchema>;

export const FormStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export type FormStatus = z.infer<typeof FormStatusSchema>;

export const FormFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'CURRENCY',
  'SELECT',
  'MULTI_SELECT',
  'CHECKBOX',
  'RADIO',
  'DATE',
  'TIME',
  'DATE_RANGE',
  'FILE_UPLOAD',
  'SIGNATURE_PAD',
  'GEOLOCATION_MAP',
  'STAR_RATING',
  'NPS_SCORE',
  'LIKERT_SCALE',
  'REPEATER_TABLE',
  'CALCULATED_FORMULA',
  'DIVIDER_HEADING',
]);
export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;

export const FormFieldConditionSchema = z.object({
  dependsOnFieldId: z.string(),
  operator: z.enum(['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS']),
  value: z.any(),
  action: z.enum(['SHOW', 'HIDE', 'REQUIRE']),
});
export type FormFieldCondition = z.infer<typeof FormFieldConditionSchema>;

export const FormFieldValidationSchema = z.object({
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  pattern: z.string().optional(),
  customErrorMessage: z.string().optional(),
});
export type FormFieldValidation = z.infer<typeof FormFieldValidationSchema>;

export const FormFieldDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  type: FormFieldTypeSchema,
  placeholder: z.string().optional(),
  defaultValue: z.any().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  validation: FormFieldValidationSchema.optional(),
  conditions: z.array(FormFieldConditionSchema).optional(),
  formula: z.string().optional(),
  tableColumns: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(['TEXT', 'NUMBER', 'SELECT']) })).optional(),
  helpText: z.string().optional(),
  icon: z.string().optional(),
});
export type FormFieldDefinition = z.infer<typeof FormFieldDefinitionSchema>;

/**
 * Pure evaluation function for conditional branching in web, mobile, and edge environments.
 */
export function isFormFieldVisible(
  field: FormFieldDefinition,
  formData: Record<string, any>
): boolean {
  if (!field.conditions || field.conditions.length === 0) return true;

  return field.conditions.every((cond) => {
    const dependentVal = formData[cond.dependsOnFieldId];

    let isMatch = false;
    switch (cond.operator) {
      case 'EQUALS':
        isMatch = String(dependentVal) === String(cond.value);
        break;
      case 'NOT_EQUALS':
        isMatch = String(dependentVal) !== String(cond.value);
        break;
      case 'GREATER_THAN':
        isMatch = Number(dependentVal) > Number(cond.value);
        break;
      case 'LESS_THAN':
        isMatch = Number(dependentVal) < Number(cond.value);
        break;
      case 'CONTAINS':
        isMatch = Array.isArray(dependentVal)
          ? dependentVal.includes(cond.value)
          : String(dependentVal || '').toLowerCase().includes(String(cond.value).toLowerCase());
        break;
      default:
        isMatch = true;
    }

    if (cond.action === 'SHOW') return isMatch;
    if (cond.action === 'HIDE') return !isMatch;
    return true;
  });
}

export const FormIntegrationConfigSchema = z.object({
  webhookUrl: z.string().url().optional(),
  slackWebhookUrl: z.string().url().optional(),
  triggerWorkflowDagId: z.string().optional(),
  emailNotificationRecipients: z.array(z.string().email()).optional(),
  requiresSupervisorSignoff: z.boolean().optional(),
});
export type FormIntegrationConfig = z.infer<typeof FormIntegrationConfigSchema>;

export const FormSchemaAstSchema = z.object({
  version: z.number().int().positive().default(1),
  fields: z.array(FormFieldDefinitionSchema),
  submitButtonText: z.string().optional(),
  successMessage: z.string().optional(),
  redirectUrl: z.string().url().optional(),
  integrations: FormIntegrationConfigSchema.optional(),
});
export type FormSchemaAst = z.infer<typeof FormSchemaAstSchema>;

export const FormDefinitionResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  mode: FormModeSchema,
  isPublic: z.boolean(),
  publicSlug: z.string().nullable().optional(),
  spatialNodeId: z.string().nullable().optional(),
  equipmentTag: z.string().nullable().optional(),
  targetWorkflowId: z.string().nullable().optional(),
  category: z.string(),
  status: FormStatusSchema,
  schemaAst: FormSchemaAstSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FormDefinitionResponse = z.infer<typeof FormDefinitionResponseSchema>;

// ─── Mobile Offline Sync & Batch Ingestion Schemas ────────────────────────────

export const MobileFormsSyncQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  spatialNodeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type MobileFormsSyncQuery = z.infer<typeof MobileFormsSyncQuerySchema>;

export const MobileFormSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  mode: FormModeSchema,
  spatialNodeId: z.string().nullable().optional(),
  equipmentTag: z.string().nullable().optional(),
  version: z.number().int(),
  status: FormStatusSchema,
  fieldsCount: z.number().int(),
  schemaAst: FormSchemaAstSchema,
  updatedAt: z.string(),
});
export type MobileFormSummary = z.infer<typeof MobileFormSummarySchema>;

export const MobileFormsSyncResponseSchema = z.object({
  forms: z.array(MobileFormSummarySchema),
  syncedAt: z.string(),
  count: z.number().int(),
});
export type MobileFormsSyncResponse = z.infer<typeof MobileFormsSyncResponseSchema>;

export const MobileDeviceMetadataSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'pwa']),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  batteryLevel: z.number().min(0).max(1).optional(),
  offlineDurationSec: z.number().int().min(0).optional(),
  gpsLatitude: z.number().min(-90).max(90).optional(),
  gpsLongitude: z.number().min(-180).max(180).optional(),
  gpsAccuracyMeters: z.number().min(0).optional(),
});
export type MobileDeviceMetadata = z.infer<typeof MobileDeviceMetadataSchema>;

export const CreateFormSubmissionSchema = z.object({
  formId: z.string(),
  submissionMode: FormModeSchema.default('OPERATIONAL'),
  spatialNodeId: z.string().uuid().optional(),
  equipmentTag: z.string().optional(),
  clientSubmissionId: z.string().min(1).max(128).optional(),
  payload: z.record(z.string(), z.any()),
  deviceMetadata: MobileDeviceMetadataSchema.optional(),
});
export type CreateFormSubmission = z.infer<typeof CreateFormSubmissionSchema>;

export const MobileBatchSubmitPayloadSchema = z.object({
  submissions: z.array(CreateFormSubmissionSchema).min(1).max(100),
});
export type MobileBatchSubmitPayload = z.infer<typeof MobileBatchSubmitPayloadSchema>;

export const MobileBatchSubmitResultItemSchema = z.object({
  clientSubmissionId: z.string().optional(),
  serverSubmissionId: z.string(),
  status: z.enum(['INGESTED', 'DUPLICATE', 'REJECTED']),
  error: z.string().optional(),
});
export type MobileBatchSubmitResultItem = z.infer<typeof MobileBatchSubmitResultItemSchema>;

export const MobileBatchSubmitResponseSchema = z.object({
  processed: z.number().int(),
  ingested: z.number().int(),
  duplicates: z.number().int(),
  failed: z.number().int(),
  results: z.array(MobileBatchSubmitResultItemSchema),
});
export type MobileBatchSubmitResponse = z.infer<typeof MobileBatchSubmitResponseSchema>;

// ─── Public "Google Forms" Dynamic URL Schemas ────────────────────────────────

export const PublicFormLookupSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]{3,64}$/, 'Invalid public slug format.'),
});
export type PublicFormLookup = z.infer<typeof PublicFormLookupSchema>;

export const PublicFormResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  schemaAst: FormSchemaAstSchema,
  submitButtonText: z.string().default('Submit'),
  tenantBranding: z.object({
    name: z.string(),
    logoUrl: z.string().optional(),
    primaryColor: z.string().optional(),
  }).optional(),
});
export type PublicFormResponse = z.infer<typeof PublicFormResponseSchema>;
