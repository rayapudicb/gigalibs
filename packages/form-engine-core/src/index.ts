/**
 * @gigalibs/form-engine-core
 *
 * Enterprise Dynamic Form Schema & Validation Engine (Frappe DocType / FormEngine.io / Typeform grade).
 * Supports declarative JSON schemas, 22+ rich UI field types, conditional logic branching (SHOW_IF, REQUIRE_IF),
 * computed formulas, and PostgreSQL JSONB persistence mapping with GIN indexes.
 *
 * @module
 */

// ─── DOMAIN TYPES ─────────────────────────────────────────────────────────────

export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'EMAIL'
  | 'PHONE'
  | 'CURRENCY'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'CHECKBOX'
  | 'RADIO'
  | 'DATE'
  | 'TIME'
  | 'DATE_RANGE'
  | 'FILE_UPLOAD'
  | 'SIGNATURE_PAD'
  | 'GEOLOCATION_MAP'
  | 'STAR_RATING'
  | 'NPS_SCORE'
  | 'LIKERT_SCALE'
  | 'REPEATER_TABLE'
  | 'CALCULATED_FORMULA'
  | 'DIVIDER_HEADING';

export interface FormFieldCondition {
  dependsOnFieldId: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
  value: any;
  action: 'SHOW' | 'HIDE' | 'REQUIRE';
}

export interface FormFieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customErrorMessage?: string;
}

export interface FormFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  defaultValue?: any;
  options?: Array<{ label: string; value: string }>;
  validation?: FormFieldValidation;
  conditions?: FormFieldCondition[];
  formula?: string; // For CALCULATED_FORMULA (e.g. "field_qty * field_price")
  tableColumns?: Array<{ key: string; label: string; type: 'TEXT' | 'NUMBER' | 'SELECT' }>; // For REPEATER_TABLE
  helpText?: string;
  icon?: string;
}

export interface FormIntegrationConfig {
  webhookUrl?: string;
  slackWebhookUrl?: string;
  salesforceSync?: boolean;
  hubspotSync?: boolean;
  triggerWorkflowDagId?: string;
  emailNotificationRecipients?: string[];
}

export interface FormSchema {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  category?: string;
  version: number;
  fields: FormFieldDefinition[];
  submitButtonText?: string;
  successMessage?: string;
  redirectUrl?: string;
  isPublic?: boolean;
  publicShareSlug?: string;
  allowDrafts?: boolean;
  integrations?: FormIntegrationConfig;
  createdAt: string;
  updatedAt?: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  tenantId: string;
  data: Record<string, any>;
  submittedBy?: string;
  ipAddress?: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  notes?: string;
  submittedAt: string;
}

// ─── FORM ENGINE RUNTIME ──────────────────────────────────────────────────────

export class FormEngine {
  /**
   * Evaluates whether a field should be visible based on its conditional logic rules.
   */
  static isFieldVisible(field: FormFieldDefinition, formData: Record<string, any>): boolean {
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

  /**
   * Validates form submission data against the schema definition.
   */
  static validate(
    schema: FormSchema,
    formData: Record<string, any>
  ): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    for (const field of schema.fields) {
      if (field.type === 'DIVIDER_HEADING') continue;
      if (!this.isFieldVisible(field, formData)) continue;

      const value = formData[field.id] ?? formData[field.name];
      const valRules = field.validation || {};

      if (valRules.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
        errors[field.id] = valRules.customErrorMessage || `${field.label} is required.`;
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
          const num = Number(value);
          if (isNaN(num)) {
            errors[field.id] = `${field.label} must be a valid number.`;
          } else {
            if (valRules.min !== undefined && num < valRules.min) {
              errors[field.id] = `${field.label} must be at least ${valRules.min}.`;
            }
            if (valRules.max !== undefined && num > valRules.max) {
              errors[field.id] = `${field.label} must not exceed ${valRules.max}.`;
            }
          }
        }

        if (field.type === 'EMAIL') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(value))) {
            errors[field.id] = 'Please provide a valid email address.';
          }
        }

        if (valRules.minLength !== undefined && String(value).length < valRules.minLength) {
          errors[field.id] = `${field.label} must have at least ${valRules.minLength} characters.`;
        }

        if (valRules.maxLength !== undefined && String(value).length > valRules.maxLength) {
          errors[field.id] = `${field.label} must not exceed ${valRules.maxLength} characters.`;
        }

        if (valRules.pattern && !new RegExp(valRules.pattern).test(String(value))) {
          errors[field.id] = valRules.customErrorMessage || `${field.label} does not match required format.`;
        }
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Evaluates computed formula expressions (e.g. qty * unit_rate).
   */
  static evaluateFormula(formula: string, formData: Record<string, any>): number {
    try {
      let expression = formula;
      for (const [key, val] of Object.entries(formData)) {
        expression = expression.replaceAll(`{${key}}`, String(Number(val) || 0));
      }
      // Safe arithmetic evaluator
      const sanitized = expression.replace(/[^0-9+\-*/().]/g, '');
      // eslint-disable-next-line no-new-func
      const result = Function(`'use strict'; return (${sanitized || 0})`)();
      return typeof result === 'number' && !isNaN(result) ? result : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Generates standard PostgreSQL DDL for forms table with JSONB GIN indexing.
   */
  static generatePostgresDdl(_schema?: FormSchema): string {
    return `-- Dynamic PostgreSQL JSONB Schema
CREATE TABLE IF NOT EXISTS forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    form_id VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    status VARCHAR(32) DEFAULT 'SUBMITTED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- High-performance GIN index on raw JSONB payload
CREATE INDEX IF NOT EXISTS idx_forms_data_gin ON forms USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_forms_tenant ON forms (tenant_id);
`;
  }

  /**
   * Generates PostgreSQL JSONB DDL table creation with GIN indexing for high-performance querying.
   */
  static generatePostgresJsonbDdl(schema: FormSchema): string {
    const tableName = `form_submissions_${schema.id.replaceAll('-', '_')}`;
    return `-- Dynamic PostgreSQL JSONB Schema for Form: ${schema.title}
CREATE TABLE IF NOT EXISTS ${tableName} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    submission_data JSONB NOT NULL,
    status VARCHAR(32) DEFAULT 'SUBMITTED',
    ip_address INET,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- High-performance GIN index on raw JSONB payload
CREATE INDEX IF NOT EXISTS idx_${tableName}_jsonb ON ${tableName} USING GIN (submission_data);

-- Fast tenant & status filtering index
CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant_status ON ${tableName} (tenant_id, status);
`;
  }
}

// ─── GigaLibs adapter ─────────────────────────────────────────────────────────
export { toFormSchema } from './gigalibs-adapter.js';
