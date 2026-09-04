export type CustomFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'json';

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  entityType: string; // e.g. 'user', 'ticket', 'invoice', 'deal'
  name: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  defaultValue?: unknown;
  options?: string[]; // for select / multi_select
  validationRule?: {
    min?: number;
    max?: number;
    regex?: string;
  };
}

export interface CustomFieldValue {
  fieldId: string;
  fieldName: string;
  value: unknown;
}
